// Setup must be imported first (calls extendZodWithOpenApi)
import "./setup.js";
import "./helpers.js";

// Module registrations (side-effect imports)
import "../modules/auth/openapi.js";
import "../modules/curriculums/openapi.js";
import "../modules/grades/openapi.js";
import "../modules/subjects/openapi.js";
import "../modules/chapters/openapi.js";
import "../modules/upload/openapi.js";
import "../modules/email/openapi.js";

import { generateOpenAPIDocument } from "./setup.js";

export const openApiDocument = generateOpenAPIDocument();
