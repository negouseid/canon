import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { openStore, type Store } from './store.js';
const samples = [
  ['The Chair Council', 'The empty chair has final say whenever the streamer leaves for snacks.'],
  ['Tactical Hydration', 'Drinking water immediately after losing is a strategic reset, never a retreat.'],
  ['The Tutorial Incident', 'We spent 47 minutes losing to a door labeled PUSH.'],
  ['Sir Buffering', 'The frozen webcam frame that ruled the channel for eleven glorious seconds.'],
  ['One More Run', 'A unit of time equal to anywhere between six minutes and sunrise.'],
  ['The Forbidden Spoon', 'A spoon used to eat pizza once. Its whereabouts remain classified.'],
  ['Gravity Patch', 'Every missed jump is evidence that gravity was buffed without patch notes.'],
  ['Snack% Speedrun', 'The only category where leaving the desk counts as optimal routing.']
];
export function seed(store: Store) {
  for (const [index, [term, definition]] of samples.entries()) store.add({ term, definition, author: 'Canon demo', sourceEvent: `seed:v1:${index}` }, 'canon');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = openStore(process.env.DATABASE_PATH || './data/canon.sqlite');
  try { seed(store); console.log(`Canon has ${store.list().length} entries. Seed safely reruns without duplicates.`); }
  finally { store.close(); }
}
