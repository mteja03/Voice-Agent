const express = require('express');
const {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getCompanyInfo,
  updateCompanyInfo,
} = require('../services/knowledgeBase');

const router = express.Router();

router.get('/projects', async (req, res, next) => {
  try {
    const projects = await listProjects();
    const query = String(req.query.q || '').trim().toLowerCase();
    if (!query) return res.json({ projects });

    const filtered = projects.filter((p) => {
      const hay = [
        p.id,
        p.name,
        p.type,
        p.location,
        p.description,
        ...(p.keywords || []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(query);
    });
    res.json({ projects: filtered });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:id', async (req, res, next) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

router.post('/projects', async (req, res, next) => {
  try {
    const project = await createProject(req.body || {});
    res.status(201).json({ project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/projects/:id', async (req, res, next) => {
  try {
    const project = await updateProject(req.params.id, req.body || {});
    res.json({ project });
  } catch (err) {
    if (err.message === 'Project not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

router.delete('/projects/:id', async (req, res, next) => {
  try {
    const removed = await deleteProject(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/company-info', async (req, res, next) => {
  try {
    const companyInfo = await getCompanyInfo();
    res.json({ companyInfo });
  } catch (err) {
    next(err);
  }
});

router.put('/company-info', async (req, res, next) => {
  try {
    const companyInfo = await updateCompanyInfo(req.body || {});
    res.json({ companyInfo });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
