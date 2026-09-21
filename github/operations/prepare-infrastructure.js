#!/usr/bin/env node
"use strict";
// Emits reviewable CloudFormation; never calls AWS or deploys the product.
const fs=require("node:fs"),path=require("node:path"),{assert}=require("../common");
const ref=n=>({Ref:n}),att=(n,k)=>({"Fn::GetAtt":[n,k]}),sub=s=>({"Fn::Sub":s});
const policy=Statement=>({Version:"2012-10-17",Statement});
const allow=(Action,Resource,extra={})=>({Effect:"Allow",Action,Resource,...extra});
const role=(principal,statements=[])=>({Type:"AWS::IAM::Role",Properties:{MaxSessionDuration:3600,AssumeRolePolicyDocument:policy([{Effect:"Allow",Principal:principal,Action:"sts:AssumeRole"}]),...(statements.length?{Policies:[{PolicyName:"bounded-capability",PolicyDocument:policy(statements)}]}:{})}});
function template(kind){
 assert(["primary","recovery"].includes(kind),"INFRASTRUCTURE_KIND_INVALID");
 const primary=kind==="primary",r={},parameters={
  OtherAccountId:{Type:"String",AllowedPattern:"[0-9]{12}"},
  KeyAdministratorArn:{Type:"String",AllowedPattern:"arn:aws:iam::[0-9]{12}:role/.+"},
  RetentionLabOperatorArn:{Type:"String",AllowedPattern:"arn:aws:iam::[0-9]{12}:role/.+"},
  AlertEmail:{Type:"String",AllowedPattern:"[^@ ]+@[^@ ]+"}
 };
 const tags=[{Key:"Product",Value:"MergeProof"},{Key:"Environment",Value:"preparation"}];
 r.SigningKey={Type:"AWS::KMS::Key",DeletionPolicy:"Retain",UpdateReplacePolicy:"Retain",Properties:{Description:`Merge-Proof ${kind} P-256 signing; trust publication pending`,KeySpec:"ECC_NIST_P256",KeyUsage:"SIGN_VERIFY",MultiRegion:false,Tags:tags,KeyPolicy:policy([
  allow("kms:*","*",{Principal:{AWS:ref("KeyAdministratorArn")}}),
  allow(["kms:DescribeKey","kms:GetPublicKey"],"*",{Principal:{AWS:ref("RetentionLabOperatorArn")}}),
  allow("kms:Sign","*",{Principal:{AWS:sub("arn:aws:iam::${AWS::AccountId}:root")},Condition:{StringEquals:{"kms:SigningAlgorithm":"ECDSA_SHA_256","kms:MessageType":"DIGEST"},ArnEquals:{"aws:PrincipalArn":att("SignerRole","Arn")}}})
 ])}};
 // Recovery signing can only be activated by its owner administrator; the
 // primary host has no trust relationship with the recovery signer.
 r.SignerRole=role({AWS:primary?att("HostRole","Arn"):ref("KeyAdministratorArn")});
 r.SignerPolicy={Type:"AWS::IAM::Policy",Properties:{PolicyName:"exact-signing-key",Roles:[ref("SignerRole")],PolicyDocument:policy([allow("kms:Sign",att("SigningKey","Arn"),{Condition:{StringEquals:{"kms:SigningAlgorithm":"ECDSA_SHA_256","kms:MessageType":"DIGEST"}}})])}};
 const bucket=(name,locked=false)=>({Type:"AWS::S3::Bucket",DeletionPolicy:"Retain",UpdateReplacePolicy:"Retain",Properties:{BucketName:sub(name),BucketEncryption:{ServerSideEncryptionConfiguration:[{ServerSideEncryptionByDefault:{SSEAlgorithm:"AES256"}}]},OwnershipControls:{Rules:[{ObjectOwnership:"BucketOwnerEnforced"}]},PublicAccessBlockConfiguration:{BlockPublicAcls:true,BlockPublicPolicy:true,IgnorePublicAcls:true,RestrictPublicBuckets:true},VersioningConfiguration:{Status:"Enabled"},...(locked?{ObjectLockEnabled:true,Tags:[...tags,{Key:"Purpose",Value:"MergeProofDisposableRetentionLab"}]}:{Tags:tags})}});
 r.Backups=bucket("merge-proof-backup-${AWS::AccountId}-${AWS::Region}");
 r.RetentionLab=bucket("merge-proof-lock-lab-${AWS::AccountId}-${AWS::Region}",true);
 for(const name of ["Backups","RetentionLab"])r[name+"Policy"]={Type:"AWS::S3::BucketPolicy",Properties:{Bucket:ref(name),PolicyDocument:policy([
  {Effect:"Deny",Principal:"*",Action:"s3:*",Resource:[att(name,"Arn"),sub(`\${${name}.Arn}/*`)],Condition:{Bool:{"aws:SecureTransport":"false"}}},
  ...(name==="RetentionLab"?[allow(["s3:GetObject","s3:GetObjectVersion","s3:GetObjectRetention"],sub("${RetentionLab.Arn}/*"),{Principal:{AWS:sub("arn:aws:iam::${OtherAccountId}:root")},Condition:{ArnLike:{"aws:PrincipalArn":sub("arn:aws:iam::${OtherAccountId}:role/merge-proof-retention-lab")}}})]:primary?[allow(["s3:GetObject","s3:GetObjectVersion"],sub("${Backups.Arn}/*"),{Principal:{AWS:sub("arn:aws:iam::${OtherAccountId}:root")},Condition:{ArnLike:{"aws:PrincipalArn":sub("arn:aws:iam::${OtherAccountId}:role/merge-proof-recovery-copy")}}})]:[])
 ])}};
 r.LabRole=role({AWS:ref("RetentionLabOperatorArn")},[
  allow(["s3:GetBucketTagging","s3:GetBucketVersioning","s3:GetBucketObjectLockConfiguration","s3:GetLifecycleConfiguration","s3:PutLifecycleConfiguration","s3:ListBucketVersions"],att("RetentionLab","Arn")),
  allow(["s3:PutObject","s3:GetObject","s3:GetObjectVersion","s3:DeleteObjectVersion","s3:GetObjectRetention","s3:PutObjectRetention"],sub("${RetentionLab.Arn}/*")),
  allow(["s3:GetObjectVersion","s3:GetObjectRetention"],sub("arn:aws:s3:::merge-proof-lock-lab-${OtherAccountId}-*/*"))]);r.LabRole.Properties.RoleName="merge-proof-retention-lab";
 r.BackupRole=role({AWS:primary?att("HostRole","Arn"):sub("arn:aws:iam::${OtherAccountId}:root")},[
  allow(["s3:ListBucket","s3:ListBucketVersions","s3:GetBucketVersioning","s3:GetBucketObjectLockConfiguration"],att("Backups","Arn")),allow(["s3:GetObject","s3:GetObjectVersion","s3:PutObject","s3:GetObjectRetention","s3:PutObjectRetention"],sub("${Backups.Arn}/*")),
  ...(primary?[allow("sts:AssumeRole",sub("arn:aws:iam::${OtherAccountId}:role/merge-proof-recovery-copy"))]:[allow(["s3:GetObject","s3:GetObjectVersion"],sub("arn:aws:s3:::merge-proof-backup-${OtherAccountId}-us-east-1/*"))])]);
 r.BackupRole.Properties.RoleName=primary?"merge-proof-primary-backup":"merge-proof-recovery-copy";
 if(!primary)r.BackupRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition={ArnEquals:{"aws:PrincipalArn":sub("arn:aws:iam::${OtherAccountId}:role/merge-proof-primary-backup")}};
 r.Alerts={Type:"AWS::SNS::Topic",Properties:{Tags:tags}};
 r.AlertSubscription={Type:"AWS::SNS::Subscription",Properties:{TopicArn:ref("Alerts"),Protocol:"email",Endpoint:ref("AlertEmail")}};
 r.Budget={Type:"AWS::Budgets::Budget",Properties:{Budget:{BudgetName:`merge-proof-${kind}-preparation`,BudgetType:"COST",TimeUnit:"MONTHLY",BudgetLimit:{Amount:primary?80:10,Unit:"USD"}},NotificationsWithSubscribers:[{Notification:{NotificationType:"FORECASTED",ComparisonOperator:"GREATER_THAN",Threshold:90,ThresholdType:"PERCENTAGE"},Subscribers:[{SubscriptionType:"EMAIL",Address:ref("AlertEmail")}]}]}};
 if(primary){
  Object.assign(parameters,{VpcId:{Type:"AWS::EC2::VPC::Id"},SubnetId:{Type:"AWS::EC2::Subnet::Id"},ImageId:{Type:"AWS::EC2::Image::Id"},SsmAgentSha256:{Type:"String",AllowedPattern:"[a-f0-9]{64}"},AvailabilityZone:{Type:"AWS::EC2::AvailabilityZone::Name"}});
  for(const name of ["PrimaryConfig","CompanionConfig","CompanionKey"])r[name]={Type:"AWS::SecretsManager::Secret",DeletionPolicy:"Retain",UpdateReplacePolicy:"Retain",Properties:{Name:`merge-proof/preparation/${name}`,Description:"Owner-supplied nonproduction acceptance configuration; no generated production credential",Tags:tags}};
  r.HostRole=role({Service:"ec2.amazonaws.com"});r.HostRole.Properties.ManagedPolicyArns=["arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"];
  // Separate policy resource avoids a HostRole -> SignerRole -> HostRole cycle.
  r.MonitorLogs={Type:"AWS::Logs::LogGroup",DeletionPolicy:"Retain",UpdateReplacePolicy:"Retain",Properties:{LogGroupName:"/merge-proof/preparation/monitor",RetentionInDays:30,Tags:tags}};
  r.MonitorLogStream={Type:"AWS::Logs::LogStream",Properties:{LogGroupName:ref("MonitorLogs"),LogStreamName:"health"}};
  r.HostPolicy={Type:"AWS::IAM::Policy",Properties:{PolicyName:"bootstrap-only",Roles:[ref("HostRole")],PolicyDocument:policy([
   allow("sts:AssumeRole",[att("SignerRole","Arn"),att("BackupRole","Arn")]),allow("secretsmanager:GetSecretValue",[ref("PrimaryConfig"),ref("CompanionConfig"),ref("CompanionKey")]),
   allow("cloudwatch:PutMetricData","*",{Condition:{StringEquals:{"cloudwatch:namespace":"MergeProof"}}}),
   allow(["logs:CreateLogStream","logs:PutLogEvents"],sub("arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/merge-proof/preparation/monitor:log-stream:health"))])}};
  r.Profile={Type:"AWS::IAM::InstanceProfile",Properties:{Roles:[ref("HostRole")]}};
  r.SecurityGroup={Type:"AWS::EC2::SecurityGroup",Properties:{VpcId:ref("VpcId"),GroupDescription:"Merge-Proof preparation: no inbound traffic; SSM only",SecurityGroupIngress:[],SecurityGroupEgress:[{IpProtocol:"tcp",FromPort:443,ToPort:443,CidrIp:"0.0.0.0/0"}],Tags:tags}};
  r.Instance={Type:"AWS::EC2::Instance",Properties:{ImageId:ref("ImageId"),InstanceType:"t3.medium",IamInstanceProfile:ref("Profile"),AvailabilityZone:ref("AvailabilityZone"),MetadataOptions:{HttpTokens:"required",HttpPutResponseHopLimit:1,HttpEndpoint:"enabled",HttpProtocolIpv6:"disabled"},CreditSpecification:{CPUCredits:"standard"},UserData:{"Fn::Base64":sub("#!/bin/bash\nset -euo pipefail\ncd /tmp\ncurl --fail --silent --show-error --location https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_amd64/amazon-ssm-agent.deb -o amazon-ssm-agent.deb\necho '${SsmAgentSha256}  amazon-ssm-agent.deb' | sha256sum -c -\ndpkg -i amazon-ssm-agent.deb\nsystemctl enable --now amazon-ssm-agent\n")},NetworkInterfaces:[{DeviceIndex:"0",AssociatePublicIpAddress:true,SubnetId:ref("SubnetId"),GroupSet:[ref("SecurityGroup")]}],BlockDeviceMappings:[{DeviceName:"/dev/xvda",Ebs:{VolumeSize:20,VolumeType:"gp3",Encrypted:true,DeleteOnTermination:true}}],Tags:tags}};
  r.StateVolume={Type:"AWS::EC2::Volume",DeletionPolicy:"Retain",UpdateReplacePolicy:"Retain",Properties:{AvailabilityZone:ref("AvailabilityZone"),Size:100,VolumeType:"gp3",Encrypted:true,Tags:tags}};
  r.BackupRole.Properties.Policies[0].PolicyDocument.Statement.push(
   allow(["ec2:DescribeVolumes","ec2:DescribeSnapshots"],"*"),
   allow("ec2:CreateSnapshot",sub("arn:aws:ec2:${AWS::Region}:${AWS::AccountId}:volume/${StateVolume}")),
   allow("ec2:CreateSnapshot",sub("arn:aws:ec2:${AWS::Region}::snapshot/*"),{Condition:{StringEquals:{"aws:RequestTag/Product":"MergeProof"}}}),
   allow("ec2:CreateTags",sub("arn:aws:ec2:${AWS::Region}::snapshot/*"),{Condition:{StringEquals:{"ec2:CreateAction":"CreateSnapshot"}}}),
   allow("ec2:DeleteSnapshot",sub("arn:aws:ec2:${AWS::Region}::snapshot/*"),{Condition:{StringEquals:{"ec2:ResourceTag/Product":"MergeProof","ec2:ResourceTag/SourceVolume":ref("StateVolume")}}}));
  r.StateAttachment={Type:"AWS::EC2::VolumeAttachment",Properties:{InstanceId:ref("Instance"),VolumeId:ref("StateVolume"),Device:"/dev/sdf"}};
  r.HostFailure={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"AWS/EC2",MetricName:"StatusCheckFailed",Dimensions:[{Name:"InstanceId",Value:ref("Instance")}],Statistic:"Maximum",Period:60,EvaluationPeriods:2,Threshold:0,ComparisonOperator:"GreaterThanThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
  r.CpuCreditBalance={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"AWS/EC2",MetricName:"CPUCreditBalance",Dimensions:[{Name:"InstanceId",Value:ref("Instance")}],Statistic:"Minimum",Period:300,EvaluationPeriods:2,DatapointsToAlarm:2,Threshold:20,ComparisonOperator:"LessThanThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
  r.StorageAlarm={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"MergeProof",MetricName:"StorageUsedPercent",Statistic:"Maximum",Period:300,EvaluationPeriods:1,Threshold:70,ComparisonOperator:"GreaterThanOrEqualToThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
  r.MemoryWarning={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"MergeProof",MetricName:"MemoryUsedPercent",Statistic:"Maximum",Period:60,EvaluationPeriods:2,Threshold:85,ComparisonOperator:"GreaterThanOrEqualToThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
  r.MemoryCritical={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"MergeProof",MetricName:"MemoryUsedPercent",Statistic:"Maximum",Period:60,EvaluationPeriods:2,Threshold:95,ComparisonOperator:"GreaterThanOrEqualToThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
  r.WarningHealth={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"MergeProof",MetricName:"WarningHealth",Statistic:"Maximum",Period:60,EvaluationPeriods:2,Threshold:0,ComparisonOperator:"GreaterThanThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
  r.HealthAlarm={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"MergeProof",MetricName:"CriticalHealth",Statistic:"Maximum",Period:60,EvaluationPeriods:2,Threshold:0,ComparisonOperator:"GreaterThanThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
  r.BackupAge={Type:"AWS::CloudWatch::Alarm",Properties:{Namespace:"MergeProof",MetricName:"RecoveryBackupAgeSeconds",Statistic:"Maximum",Period:300,EvaluationPeriods:1,Threshold:900,ComparisonOperator:"GreaterThanThreshold",TreatMissingData:"breaching",AlarmActions:[ref("Alerts")]}};
 }
 return {AWSTemplateFormatVersion:"2010-09-09",Description:`Merge-Proof ${kind} preparation only; no product deployment, public publication or production Object Lock`,Parameters:parameters,Resources:r,Outputs:{SigningKeyArn:{Value:att("SigningKey","Arn")},SignerRoleArn:{Value:att("SignerRole","Arn")},BackupBucket:{Value:ref("Backups")},RetentionLabBucket:{Value:ref("RetentionLab")},LabRoleArn:{Value:att("LabRole","Arn")},BackupRoleArn:{Value:att("BackupRole","Arn")},...(primary?{InstanceId:{Value:ref("Instance")},StateVolumeId:{Value:ref("StateVolume")}}:{})}};
}
if(require.main===module){const output=process.argv[2];assert(path.isAbsolute(output),"ABSOLUTE_OUTPUT_REQUIRED");fs.mkdirSync(output,{recursive:true,mode:0o700});for(const kind of ["primary","recovery"])fs.writeFileSync(path.join(output,kind+".cloudformation.json"),JSON.stringify(template(kind),null,2)+"\n",{flag:"wx",mode:0o600});console.log("PREPARED_ONLY: no AWS call, product deployment or publication");}
module.exports={template};
