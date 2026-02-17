import { validatePrerequisites, printValidationResults } from "../src/validate/index.js";

const result = await validatePrerequisites();
printValidationResults(result);
process.exit(result.ok ? 0 : 1);
