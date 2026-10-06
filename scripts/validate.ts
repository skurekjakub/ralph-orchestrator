import { validatePrerequisites, printValidationResults } from "../src/validate/index";

const result = await validatePrerequisites();
printValidationResults(result);
process.exit(result.ok ? 0 : 1);
