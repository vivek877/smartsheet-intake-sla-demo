export type Priority = 'Low'|'Medium'|'High';
export type Status = 'Open'|'In Progress'|'Resolved'|'Escalated';
export interface Req {
  _id: string;
  customer: string; title: string; description?: string;
  priority: Priority; status: Status; assignee?: string; dueDate?: string; tags?: string[];
  comments?: { by: string; text: string; at: string }[];
  audit?: { at: string; by: string; action: string; diff?: any }[];
  createdAt: string; updatedAt: string;
}