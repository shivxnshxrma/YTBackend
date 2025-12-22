import { apiError } from '../utils/apiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import {User} from '../models/user.model.js'
import {deleteFromCloudinary, getPublicIdFromUrl, uploadOnCloudinary} from '../utils/cloudinary.js'
import {apiResponse} from '../utils/apiResponse.js'
import jwt from 'jsonwebtoken'

const generateAccessAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false})
        return {accessToken,refreshToken}
    } catch (error) {
        throw new apiError(500,"Something went wrong while generating refresh and access token!")
    }
}

const registerUser = asyncHandler(async(req,res)=>{
    const{userName,fullName,email,password} =req.body
    if([userName,fullName,email,password].some((field)=> field?.trim()==="")){
        throw new apiError(400,"All fields are required!")
    }
    const existingUser = await User.findOne({
        $or: [{userName},{email}]
    })
    if(existingUser) throw new apiError(400,"User with this email or Username already exists!")
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length >0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }
    if(!avatarLocalPath) throw new apiError(400,"Avatar field is required!")
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar) throw new apiError(400,"Avatar field is required!")
    const user = await User.create({
        fullName,
        avatar:avatar.url,
        coverImage:coverImage?.url || "",
        email,
        password,
        userName:userName.toLowerCase()
    })
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser) throw new apiError(500,"Something went wrong while registering the user!")
    return res.status(201).json(
        new apiResponse(200,createdUser,"User registered successfully!")
    )
    })

const loginUser = asyncHandler(async(req,res)=>{
    const {email,userName,password} = req.body;
    if(!(userName || email)){
        throw new apiError(400, "Username or email is required!");
    }
    const user = await User.findOne(
        {
            $or :[{userName},{email}]
        }
    )
    if(!user){
        throw new apiError(404,"User does not exist!");
    }
   const isPasswordValid = await user.isPasswordCorrect(password);
   if(!isPasswordValid){
    throw new apiError(401,"Invalid Login Credentials!");
   }
   const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id);
   const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
   const options = {
    httpOnly: true,
    secure: true
   }
   return res
   .status(200)
   .cookie("accessToken",accessToken,options)
   .cookie("refreshToken",refreshToken,options)
   .json(
    new apiResponse(200,
        {
            user: loggedInUser,accessToken,refreshToken
        },
        "User Logged In Successfully!"
    )
   )
})

const logoutUser =  asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new apiResponse(200,"User Logged Out Successfully!"))
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new apiError(401,"Unauthorized!")
    }
   try {
    const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    const user = await User.findById(decodedToken?._id)
    if(!user){
     throw new apiError(401,"Invalid Refresh Token!")
    }
    if(incomingRefreshToken !== user?.refreshToken){
     throw new apiError(401, "Refresh token is expired or used!")
    }
    const options = {
     httpOnly: true,
     secure: true
    }
    const {accessToken,newrefreshToken} = await generateAccessAndRefreshToken(user._id)
    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",newrefreshToken,options)
    .json(
     new apiResponse(
         200,
         {accessToken, refreshToken: newrefreshToken},
         "Access Token Refreshed!"
     )
    )
   } catch (error) {
    throw new apiError(401,error?.message || "Invalid Refresh Token!")
   }
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword} = req.body
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect){
        throw new apiError(400,"Old Password is incorrect!")
    }
    user.password = newPassword
    await user.save({validateBeforeSave:false})
    return res
    .status(200)
    .json(new apiResponse(200,{},"Passwrod Changed Successfully!"))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(200,req.user,"Current User Fetched Successfully!")
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName, email} = req.body
    if(!fullName || !email){
        throw new apiError(400,"All Fields are required!")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new apiResponse(200,user,"Account Details Updated Successfully!"))
})

const updateUserAvatar = asyncHandler(async(req, res) => {
    // 1. Check if local file exists
    const avatarLocalPath = req.file?.path
    if (!avatarLocalPath) {
        throw new apiError(400, "Avatar file is missing!")
    }

    // 2. Upload the NEW image to Cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    
    if (!avatar.url) {
        throw new apiError(400, "Error while uploading avatar!")
    }

    // 3. Find the user to get the OLD avatar url
    // We need the user object before updating it to access the old .avatar property
    const user = await User.findById(req.user?._id)

    // 4. Delete the OLD image from Cloudinary (if it exists)
    if (user?.avatar) {
        // We need a helper to extract the public ID from the full URL
        const oldAvatarPublicId = getPublicIdFromUrl(user.avatar) 
        
        // Call your Cloudinary deletion method (implementation below)
        await deleteFromCloudinary(oldAvatarPublicId)
    }

    // 5. Update the user in MongoDB with the NEW url
    user.avatar = avatar.url
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new apiResponse(200, user, "Avatar updated successfully"))
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    // 1. Check if local file exists
    const coverLocalPath = req.file?.path
    if (!coverLocalPath) {
        throw new apiError(400, "Cover File is missing!")
    }

    // 2. Upload the NEW image to Cloudinary first
    const cover = await uploadOnCloudinary(coverLocalPath)
    if (!cover.url) {
        throw new apiError(400, "Error while uploading Cover Image!")
    }

    // 3. Find the user to get the OLD cover image URL
    const user = await User.findById(req.user?._id)

    // 4. Delete the OLD image from Cloudinary
    if (user?.coverImage) {
        // Extract public ID from the old URL
        const oldCoverPublicId = getPublicIdFromUrl(user.coverImage)
        
        // Execute delete (we don't await this to block the response if speed is critical, 
        // but awaiting is safer to ensure cleanup happens)
        await deleteFromCloudinary(oldCoverPublicId)
    }

    // 5. Update the user in MongoDB
    user.coverImage = cover.url
    await user.save({ validateBeforeSave: false })

    // Return response
    // Note: We return the 'user' object we just modified
    return res
        .status(200)
        .json(new apiResponse(200, user, "Cover Image updated successfully"))
})

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    const {userName} = req.params
    if(!userName){
        throw new apiError(400,"Username is missing!")
    }
    const channel = await User.aggregate([
        {
            $match: {userName: userName.toLowerCase()}
        },
        { 
            $lookup: {
                from: "subscription",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscription",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: { $size: "$subscribers" },
                subscribedToCount: { $size: "$subscribedTo" },
                isSubscribed: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, "$subscribers.subscriber"]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                userName: 1,
                subscribersCount: 1,
                subscribedToCount: 1,
                isSubscribed: 1,
                coverImage: 1,
                avatar: 1,
                email: 1,
                createdAt: 1,
            }
        }
    ])
    if(!channel || channel.length===0){
        throw new apiError(404,"Channel not found!")
    }
    return res
    .status(200)
    .json(new apiResponse(200,channel[0],"User Channel Fetched Successfully!"))
})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await User.aggregate([
        {
            $match: {_id: new mongoose.Types.ObjectId(req.user?._id)}
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        userName: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: { $first: "$owner" }
                        }
                    }
                ]
            }
        },
        {
            $project: {
                watchHistory: 1
            }
        }
    ])
    return res
    .status(200)
    .json(new apiResponse(200,user[0].watchHistory,"Watch History Fetched Successfully!"))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}