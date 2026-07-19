// Fixture: processor.ts — calls functions from both utils and service

import { formatName, isEmpty } from "./utils.js";
import { UserService, greetUser } from "./service.js";

export function processUsers(ids: number[]): string[] {
  const service = new UserService();
  const users = service.listUsers(ids);
  return users.map((u) => greetUser(u));
}

export function validateName(name: string): boolean {
  return !isEmpty(name) && formatName(name).length > 0;
}
