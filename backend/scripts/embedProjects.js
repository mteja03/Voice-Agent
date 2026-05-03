require('dotenv').config();

const { getSupabase } = require('../services/supabaseClient');
const { embedProject } = require('../services/embeddingService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const supabase = getSupabase();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .is('embedding', null)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = projects || [];
  console.log(`Embedding ${rows.length} projects...`);

  let embedded = 0;
  let failed = 0;

  for (const project of rows) {
    try {
      const embedding = await embedProject(project);
      const { error: updateError } = await supabase
        .from('projects')
        .update({ embedding })
        .eq('id', project.id);
      if (updateError) throw updateError;
      embedded += 1;
      console.log(`✅ ${project.name} — embedded`);
    } catch (err) {
      failed += 1;
      console.log(`❌ ${project.name} — failed (${err.message})`);
    }
    await sleep(200);
  }

  console.log(`Done. ${embedded} embedded, ${failed} failed.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Embed script failed:', err.message);
    process.exit(1);
  });
