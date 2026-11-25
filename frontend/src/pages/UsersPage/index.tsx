import UserDetail from "../../components/UserDetail"
import UserList from "../../components/UserList"
import { useHashValue } from "../../hooks/useHashValue"
import { hashId } from "../../utils/hash"

// Admins only: the user list, or one user's details when the address names them (#/users?user=5).
export default function UsersPage() {
  const userId = useHashValue(() => hashId("user"))
  return userId === null ? <UserList /> : <UserDetail key={userId} userId={userId} />
}
