// fetch helper for the front desk part of the Dashboard: /api/v1/overview (gym managers and admins).
import type { Overview } from "../types/overview"
import { request } from "./api"

export const getOverview = () => request<Overview>("/api/v1/overview")
