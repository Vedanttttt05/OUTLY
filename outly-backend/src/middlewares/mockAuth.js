export const mockAuth = (req, res, next) => {
  req.auth = { userId: "test_user_123" }
  next()
}