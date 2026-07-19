// Fixture: service.ts — defines a class with methods that call other functions

import { formatName } from "./utils.js";

export interface User {
  id: number;
  name: string;
}

export class UserService {
  findUser(id: number): User {
    return { id, name: formatName("user-" + id) };
  }

  listUsers(ids: number[]): User[] {
    return ids.map((id) => this.findUser(id));
  }
}

export function greetUser(user: User): string {
  return `Hello, ${formatName(user.name)}!`;
}
