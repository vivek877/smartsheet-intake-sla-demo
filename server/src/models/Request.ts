import mongoose, { Schema } from 'mongoose';

export type Priority = 'Low'|'Medium'|'High';
export type Status = 'Open'|'In Progress'|'Resolved'|'Escalated';

const CommentSchema = new Schema({
  by: { type: String, default: 'demo-user' },
  text: { type: String, required: true },
  at: { type: Date, default: Date.now }
}, { _id: false });

const AttachmentSchema = new Schema({
  name: String,
  url: String
}, { _id: false });

const AuditSchema = new Schema({
  at: { type: Date, default: Date.now },
  by: { type: String, default: 'system' },
  action: { type: String, required: true },
  diff: { type: Schema.Types.Mixed }
}, { _id: false });

const RequestSchema = new Schema({
  customer: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  priority: { type: String, enum: ['Low','Medium','High'], default: 'Medium' },
  status: { type: String, enum: ['Open','In Progress','Resolved','Escalated'], default: 'Open' },
  assignee: String,
  dueDate: Date,
  tags: [String],
  attachments: [AttachmentSchema],
  comments: [CommentSchema],
  audit: [AuditSchema]
}, { timestamps: true });

export const Request = mongoose.model('Request', RequestSchema);