import mongoose, {Schema} from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
const userSchema = new Schema({
    username : {
        typeof : String,
        required: true,
        unique: true,
        lowercase : true,
        trim: true,
        index: true
    },
    email : {
        typeof : String,
        required: true,
        unique: true,
        lowercase : true,
        trim: true,
    },
    fullname : {
        typeof : String,
        required: true,
        trim: true,
        index: true
    },
    avatar : {
        typeof: String,
        required: true
    },
    coverimage:{
        typeof: String
    },
    watchHistory:[{
        typeof:Schema.Types.ObjectId,
        ref:"Video"
    }],
    password: {
        typeof: String,
        required: [true, "Password is required!"]
    },
    refreshToken:{
        typeof : String
    }
},
{
    timestamps: true
})

userSchema.pre("save",async function (next){
    if(!this.isModified("password")) return next();
    this.password = bcrypt.hash(this.password,10);
    next();
})

userSchema.methods.isPasswordCorrect = async function (password){
    return await bcrypt.compare(password,this.password)
}

userSchema.methods.generateAccessToken = function (){
    jwt.sign({
        _id:this._id,
        email:this.email,
        username:this.username,
        fullname:this.fullname
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY
    }
    )
}

userSchema.methods.generateAccessToken = function (){

}

export const User = mongoose.model("User",userSchema);