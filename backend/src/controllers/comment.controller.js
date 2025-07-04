import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Comment } from "../models/comment.model.js";
import { Video } from "../models/video.model.js";
import jwt from "jsonwebtoken";
import { Like } from "../models/like.model.js";


const getVideoComments = asyncHandler(async (req, res) => {
  //TODO: get all comments for a video
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const skip = (page - 1) * limit;

  const filter = {};

  if (videoId) {
    filter.video = videoId;
  }

    const totalComment = await Comment.countDocuments(filter);
  const comments = await Comment.find(filter)
    .populate("owner", "username avatar fullName")
    .lean()
    .skip(parseInt(skip))
    .limit(parseInt(limit))

  // Step 1: Get all likes for comments in one query
  const commentIds = comments.map((c) => c._id);
  const likes = await Like.find({
    comment: { $in: commentIds },
  }).select("comment likedBy");

  // Step 2: Build helper maps
  const likeCountMap = {};
  const isLikedMap = {};

  likes.forEach((like) => {
    const commentId = like.comment.toString();
    const likedBy = like.likedBy.toString();

    //  Count likes
    if (!likeCountMap[commentId]) {
      likeCountMap[commentId] = 0;
    }
    likeCountMap[commentId]++;

    // Track if current user liked this comment
    if (likedBy === req.user._id.toString()) {
      isLikedMap[commentId] = true;
    }
  });

  // Step 3: Enrich each comment
  const enrichedComments = comments.map((comment) => {
    const id = comment._id.toString();
    return {
      ...comment,
      isLiked: !!isLikedMap[id],
      likeCount: likeCountMap[id] || 0,
    };
  });

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        {
          enrichedComments,
          page: parseInt(page),
          totalPages: Math.ceil(totalComment / limit),
          totalComment,
        },
        "All comments are fetched"
      )
    );
});

const addComment = asyncHandler(async (req, res) => {
  // TODO: add a comment to a video
  const { videoId } = req.params;
  const { content } = req.body;

  const video = await Video.findById(req.params.videoId);
  if (!video) {
    throw new apiError(400, "Video does not exist");
  }

  const comment = await Comment.create({
    content,
    owner: req.user._id,
    video: video._id,
  });

  return res
    .status(200)
    .json(new apiResponse(200, comment, "Comment is created successfully"));
});

const updateComment = asyncHandler(async (req, res) => {
  // TODO: update a comment
  const { commentId } = req.params;

  const { content } = req.body;
  if (!content?.trim()) {
    throw new apiError(400, "All fields are required");
  }

  const comment = await Comment.findById(req.params.commentId);
  if (!comment) {
    throw new apiError(401, "Commnet is not available");
  }

  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    throw new apiError(401, "Unauthorized request");
  }
  const verifiedUser = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

  if (verifiedUser._id != comment?.owner) {
    throw new apiError(400, "You don't have permission");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    comment?._id,
    {
      $set: {
        content,
      },
    },
    { new: true }
  );

  return res
    .status(200)
    .json(
      new apiResponse(200, updatedComment, "Comment is updated successfully")
    );
});

const deleteComment = asyncHandler(async (req, res) => {
  // TODO: delete a comment
  const { commentId } = req.params;

  const comment = await Comment.findById(req.params.commentId);
  if (!comment) {
    throw new apiError(401, "Commnet is not available");
  }

  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    throw new apiError(401, "Unauthorized request");
  }
  const verifiedUser = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

  if (verifiedUser._id != comment?.owner) {
    throw new apiError(400, "You don't have permission");
  }

  const deletedComment = await Comment.findByIdAndDelete(comment._id);

  return res
    .status(200)
    .json(new apiResponse(200, deletedComment, "Comment is deleted"));
});

export { getVideoComments, addComment, updateComment, deleteComment };
