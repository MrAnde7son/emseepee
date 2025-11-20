import { executeQuery, executeQueryOne, executeUpdate, getDatabaseConfig } from "../connection.js";
import { createHash, randomBytes } from "crypto";

export interface User {
  id: number;
  email: string;
  name: string | null;
  passwordHash: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  password: string;
  role?: string;
}

export interface UpdateUserInput {
  name?: string;
  password?: string;
  role?: string;
}

/**
 * Hash password using SHA-256 (for simplicity, in production use bcrypt)
 */
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/**
 * Create a new user
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = hashPassword(input.password);
  const role = input.role || "user";
  const config = getDatabaseConfig();

  if (config.type === "postgres") {
    const result = await executeQuery<{ id: number; email: string; name: string | null; password_hash: string; role: string; created_at: string; updated_at: string }>(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, password_hash as password_hash, role, created_at, updated_at`,
      [input.email, input.name || null, passwordHash, role]
    );
    const row = result[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } else {
    const result = await executeUpdate(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [input.email, input.name || null, passwordHash, role]
    );
    
    const user = await getUserByEmail(input.email);
    if (!user) {
      throw new Error("Failed to create user");
    }
    return user;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const config = getDatabaseConfig();
  
  let query: string;
  if (config.type === "postgres") {
    query = `SELECT id, email, name, password_hash as "passwordHash", role, created_at as "createdAt", updated_at as "updatedAt"
            FROM users WHERE email = $1`;
  } else {
    query = `SELECT id, email, name, password_hash as passwordHash, role, created_at as createdAt, updated_at as updatedAt
            FROM users WHERE email = ?`;
  }

  const result = await executeQueryOne<{
    id: number;
    email: string;
    name: string | null;
    passwordHash: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }>(query, [email]);

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    email: result.email,
    name: result.name,
    passwordHash: result.passwordHash,
    role: result.role,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * Get user by ID
 */
export async function getUserById(id: number): Promise<User | null> {
  const config = getDatabaseConfig();
  
  let query: string;
  if (config.type === "postgres") {
    query = `SELECT id, email, name, password_hash as "passwordHash", role, created_at as "createdAt", updated_at as "updatedAt"
            FROM users WHERE id = $1`;
  } else {
    query = `SELECT id, email, name, password_hash as passwordHash, role, created_at as createdAt, updated_at as updatedAt
            FROM users WHERE id = ?`;
  }

  const result = await executeQueryOne<{
    id: number;
    email: string;
    name: string | null;
    passwordHash: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }>(query, [id]);

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    email: result.email,
    name: result.name,
    passwordHash: result.passwordHash,
    role: result.role,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * Verify user password
 */
export async function verifyPassword(email: string, password: string): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user) {
    return null;
  }

  const passwordHash = hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    return null;
  }

  return user;
}

/**
 * Update user
 */
export async function updateUser(id: number, input: UpdateUserInput): Promise<User> {
  const config = getDatabaseConfig();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    updates.push(config.type === "postgres" ? "name = $" : "name = ?");
    params.push(input.name);
  }

  if (input.password !== undefined) {
    const passwordHash = hashPassword(input.password);
    updates.push(config.type === "postgres" ? "password_hash = $" : "password_hash = ?");
    params.push(passwordHash);
  }

  if (input.role !== undefined) {
    updates.push(config.type === "postgres" ? "role = $" : "role = ?");
    params.push(input.role);
  }

  if (updates.length === 0) {
    const user = await getUserById(id);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);

  // Build parameter placeholders for PostgreSQL
  let paramIndex = 1;
  const setClause = updates.map((update) => {
    if (config.type === "postgres") {
      return update.replace("?", `$${paramIndex++}`);
    }
    return update;
  }).join(", ");
  
  const whereClause = config.type === "postgres" ? `WHERE id = $${paramIndex}` : "WHERE id = ?";

  await executeUpdate(
    `UPDATE users SET ${setClause} ${whereClause}`,
    params
  );

  const user = await getUserById(id);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

/**
 * Delete user
 */
export async function deleteUser(id: number): Promise<void> {
  const config = getDatabaseConfig();
  const query = config.type === "postgres" 
    ? `DELETE FROM users WHERE id = $1`
    : `DELETE FROM users WHERE id = ?`;
  
  await executeUpdate(query, [id]);
}

/**
 * List all users
 */
export async function listUsers(): Promise<User[]> {
  const config = getDatabaseConfig();
  
  let query: string;
  if (config.type === "postgres") {
    query = `SELECT id, email, name, password_hash as "passwordHash", role, created_at as "createdAt", updated_at as "updatedAt"
            FROM users ORDER BY created_at DESC`;
  } else {
    query = `SELECT id, email, name, password_hash as passwordHash, role, created_at as createdAt, updated_at as updatedAt
            FROM users ORDER BY created_at DESC`;
  }

  const results = await executeQuery<{
    id: number;
    email: string;
    name: string | null;
    passwordHash: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }>(query);

  return results.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

