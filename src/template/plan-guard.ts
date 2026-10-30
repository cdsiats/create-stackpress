import { CliError } from '../errors.js';
import { isDatabaseId, isProjectType, type CreatePlan } from '../types.js';

/**
 * Validates the plan fields every template resolver needs. Keeping this in one
 * place makes fragment resolution and custom-template resolution reject the
 * same malformed plans with the same usage errors.
 */
export function assertTemplatePlan(plan: CreatePlan, action: string): void {
  if (!plan || typeof plan !== 'object') {
    throw CliError.usage(`A create plan is required to ${action}.`);
  }
  if (!isProjectType(plan.type)) {
    throw CliError.usage(`Unknown project type "${String(plan.type)}".`);
  }
  if (!isDatabaseId(plan.database)) {
    throw CliError.usage(`Unknown database "${String(plan.database)}".`);
  }
  if (typeof plan.packageName !== 'string' || plan.packageName.length === 0) {
    throw CliError.usage(`A package name is required to ${action}.`);
  }
}
