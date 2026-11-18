// fetch helpers for sign up, log in and the logged-in user's own account.
import type { LoginResult, SignupBody, User } from "../types/auth"
import { request } from "./api"

export const signup = (body: SignupBody) =>
  request<User>("/api/v1/auth/signup", { method: "POST", body: JSON.stringify(body) })

export const login = (email: string, password: string) =>
  request<LoginResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })

export const getMe = () => request<User>("/api/v1/users/me")

export const renameMe = (name: string) =>
  request<User>("/api/v1/users/me", { method: "PATCH", body: JSON.stringify({ name }) })
