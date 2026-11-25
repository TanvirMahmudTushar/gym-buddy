/** One page of a list, as every list endpoint sends it. total counts every match, not just this page. */
export interface Page<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}
