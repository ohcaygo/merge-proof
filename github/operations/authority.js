"use strict";
const {assert}=require("../common");
// This root-owned deployment input records an external owner decision. The
// program cannot grant that authority, and preparation never sets this flag.
function environment(config){assert(config.environment==="nonproduction"||config.environment==="production"&&config.productionActivationAuthorized===true,"OWNER_PRODUCTION_ACTIVATION_REQUIRED");}
module.exports={environment};
