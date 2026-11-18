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

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>("/api/v1/users/me/password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
