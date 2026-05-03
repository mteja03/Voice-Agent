const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

async function run() {
  const companyInfoPath = path.resolve(__dirname, '../data/companyInfo.json');
  const projectsPath = path.resolve(__dirname, '../data/projects.json');
  const companyInfo = readJson(companyInfoPath);
  const projects = readJson(projectsPath);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      'Missing Supabase config: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).'
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // STEP 1 — Company
  const companyName = String(companyInfo?.name || '').trim();
  if (!companyName) {
    throw new Error('companyInfo.json must include a non-empty "name"');
  }

  const { data: existingCompany, error: companySelectError } = await supabase
    .from('companies')
    .select('id,name')
    .eq('name', companyName)
    .maybeSingle();
  if (companySelectError) throw companySelectError;

  let companyId = existingCompany?.id;
  if (existingCompany) {
    const { error: updateCompanyError } = await supabase
      .from('companies')
      .update({ profile: companyInfo })
      .eq('id', companyId);
    if (updateCompanyError) throw updateCompanyError;
    console.log('Company already exists, profile refreshed');
  } else {
    const { data: insertedCompany, error: insertCompanyError } = await supabase
      .from('companies')
      .insert({ name: companyName, profile: companyInfo })
      .select('id,name')
      .single();
    if (insertCompanyError) throw insertCompanyError;
    companyId = insertedCompany.id;
    console.log('Created company', companyId);
  }

  // STEP 2 — Admin user
  const adminEmail = String(process.env.SEED_ADMIN_EMAIL || 'mteja0852@gmail.com').trim().toLowerCase();
  const adminPassword = String(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@123');

  const { data: existingUser, error: userSelectError } = await supabase
    .from('users')
    .select('id,email,platform_role,company_id')
    .eq('email', adminEmail)
    .maybeSingle();
  if (userSelectError) throw userSelectError;

  if (existingUser) {
    if (existingUser.platform_role !== 'master_admin') {
      const { error: promoteError } = await supabase
        .from('users')
        .update({
          platform_role: 'master_admin',
          company_id: companyId,
        })
        .eq('id', existingUser.id);
      if (promoteError) throw promoteError;
      console.log('Promoted to master_admin');
    } else {
      console.log('Admin already exists, skipping');
    }
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const { data: insertedUser, error: insertUserError } = await supabase
      .from('users')
      .insert({
        email: adminEmail,
        password_hash: passwordHash,
        role: 'admin',
        platform_role: 'master_admin',
        company_id: companyId,
      })
      .select('id,email')
      .single();
    if (insertUserError) throw insertUserError;
    console.log('Created admin user', insertedUser.id);
    console.warn('Please change the seeded admin password immediately.');
  }

  // STEP 3 — Projects
  const { data: existingProjects, error: existingProjectsError } = await supabase
    .from('projects')
    .select('name')
    .eq('company_id', companyId);
  if (existingProjectsError) throw existingProjectsError;

  const existingNames = new Set((existingProjects || []).map((p) => String(p.name || '').trim()));
  const toInsert = (Array.isArray(projects) ? projects : []).filter(
    (project) => !existingNames.has(String(project?.name || '').trim())
  );

  if (toInsert.length === 0) {
    console.log(`All ${existingNames.size} projects already seeded`);
  } else {
    const rows = toInsert.map((project) => ({
      company_id: companyId,
      name: String(project.name || '').trim(),
      type: String(project.type || '').trim(),
      location: String(project.location || '').trim(),
      description: String(project.description || '').trim(),
      offer: String(project.offer || '').trim(),
      url: String(project.url || '').trim(),
      keywords: Array.isArray(project.keywords) ? project.keywords : [],
      amenities: Array.isArray(project.amenities) ? project.amenities : [],
      metadata: project,
    }));

    const { error: insertProjectsError } = await supabase
      .from('projects')
      .insert(rows);
    if (insertProjectsError) throw insertProjectsError;

    console.log(`Inserted ${rows.length} projects:`);
    for (const row of rows) {
      console.log(`- ${row.name}`);
    }
  }

  console.log('Seed complete.');
  console.log(`Company ID: ${companyId}`);
  console.log(`Admin Email: ${adminEmail}`);
}

run().catch((err) => {
  console.error('Seed failed:', err?.message || err);
  process.exit(1);
});
