// Account types matching the FastAPI schemas (TDD 5.3).
export type Role = "user" | "gym_manager" | "admin"

export interface User {
  id: number
  email: string
  name: string
  role: Role
  created_at: string
}

export interface LoginResult {
  access_token: string
  token_type: "bearer"
  user: User
}

export interface SignupBody {
  email: string
  name: string
  password: string
}

export interface UserPage {
  items: User[]
  total: number
  offset: number
  limit: number
}
