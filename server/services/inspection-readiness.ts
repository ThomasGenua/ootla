// Reopening a repair task must also remove the unit from ready leasing actions.
export const noOpenInspectionRepairs=(unit:string)=>`NOT EXISTS(SELECT 1 FROM inspection_repairs repair JOIN unit_inspections inspection ON inspection.id=repair.inspection_id JOIN tasks repair_task ON repair_task.id=repair.task_id WHERE inspection.unit_id=${unit}.id AND repair_task.status='open')`;
