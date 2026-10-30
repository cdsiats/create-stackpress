//modules
import { action } from '@stackpress/ingest';

export default action(async function HomePage({ res }) {
  res.results({ title: 'Welcome to {{name}}' });
});
