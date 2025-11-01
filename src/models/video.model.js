import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema({
    videofile:{
        typeof: String,
        required: true
    },
    thumbnail:{
        typeof: String,
        required: true
    },
    title:{
        typeof: String,
        required: true
    },
    description:{
        typeof: String,
        required: true
    },
    duration:{
        typeof: Number,
        required: true
    },
    views:{
        typeof: Number,
        default: 0
    },
    isPublished:{
        typeof:Boolean,
        default: true
    },
    owner:{
        typeof: Schema.Types.ObjectId,
        ref:"User"
    }
},{timestamps:true})

videoSchema.plugin(mongooseAggregatePaginate)

export const Video = mongoose.model("Video",videoSchema)