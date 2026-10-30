// Database: {{database}}
// Adapter: {{adapter}}
// Driver: {{driver}}
export const database = '{{database}}';
export const adapter = '{{adapter}}';
export const driver = '{{driver}}';

export default async function connect() {
  return { database, adapter, driver };
}
