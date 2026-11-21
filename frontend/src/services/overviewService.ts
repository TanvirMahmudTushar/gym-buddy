// fetch helper for the Gym Manager's start page: /api/v1/overview (gym managers and admins).
import type { Overview } from "../types/overview"
import { request } from "./api"

export const getOverview = () => request<Overview>("/api/v1/overview")
