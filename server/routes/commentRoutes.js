import express from "express";
import { addComment, getTaskComments } from "../controllers/commentController.js";
import { protect } from "../middlewares/authMiddleware.js";

const commentRouter = express.Router();

commentRouter.post('/', protect, addComment);
commentRouter.get('/:taskId', protect, getTaskComments);

export default commentRouter;