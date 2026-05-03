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
const { safeClientMessage } = require('../utils/sanitize');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');

const router = express.Router();

router.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const projects = await listProjects(req.companyId);
    const query = String(req.query.q || '').trim().toLowerCase();
    if (!query) {
      return sendSuccess(res, { projects });
    }
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
    return sendSuccess(res, { projects: filtered });
  })
);

router.get(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.companyId, req.params.id);
    if (!project) {
      return sendError(res, 404, 'Project not found');
    }
    return sendSuccess(res, { project });
  })
);

router.post(
  '/projects',
  asyncHandler(async (req, res) => {
    try {
      const project = await createProject(req.companyId, req.body || {});
      return sendSuccess(res, { project }, {}, 201);
    } catch (err) {
      return sendError(res, 400, safeClientMessage(err));
    }
  })
);

router.put(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    try {
      const project = await updateProject(req.companyId, req.params.id, req.body || {});
      return sendSuccess(res, { project });
    } catch (err) {
      if (err.message === 'Project not found') {
        return sendError(res, 404, safeClientMessage(err));
      }
      return sendError(res, 400, safeClientMessage(err));
    }
  })
);

router.delete(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const removed = await deleteProject(req.companyId, req.params.id);
    if (!removed) {
      return sendError(res, 404, 'Project not found');
    }
    return sendSuccess(res, { deleted: true });
  })
);

router.get(
  '/company-info',
  asyncHandler(async (req, res) => {
    const companyInfo = await getCompanyInfo(req.companyId);
    return sendSuccess(res, { companyInfo });
  })
);

router.put(
  '/company-info',
  asyncHandler(async (req, res) => {
    const companyInfo = await updateCompanyInfo(req.companyId, req.body || {});
    return sendSuccess(res, { companyInfo });
  })
);

module.exports = router;
