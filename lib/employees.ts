import fs from "fs/promises";
import path from "path";
import type { EmployeeRaw, LeaveEntry } from "./leave";

const DATA_PATH = path.join(process.cwd(), "data", "employees.json");

export async function readEmployees(): Promise<EmployeeRaw[]> {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  const data = JSON.parse(raw) as EmployeeRaw[];
  return data;
}

export async function writeEmployees(employees: EmployeeRaw[]): Promise<void> {
  const json = JSON.stringify(employees, null, 2);
  await fs.writeFile(DATA_PATH, json, "utf-8");
}

/**
 * Add a leave entry to a single employee and save to disk.
 */
export async function addLeaveEntryToEmployee(
  employeeId: string,
  entry: LeaveEntry
): Promise<EmployeeRaw[]> {
  const employees = await readEmployees();
  const index = employees.findIndex((emp) => emp.id === employeeId);

  if (index === -1) {
    throw new Error(`Employee with id ${employeeId} not found`);
  }

  employees[index].leaveTaken.push(entry);

  await writeEmployees(employees);
  return employees;
}
