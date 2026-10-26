import express from "express";
import { addMember, createProject, updateProject, getProject } from "../controllers/projectController.js";

const projectRouter = express.Router();

projectRouter.post('/', createProject)
projectRouter.put('/', updateProject)
projectRouter.get('/:id', getProject)
projectRouter.post('/:projectId/addMember', addMember)

export default projectRouter;