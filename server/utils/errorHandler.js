export const handleError = (error, res, defaultMessage = "An error occurred") => {
  // Log detailed error for debugging
  console.error('Error:', error);

  // In production, return generic message to avoid exposing internal details
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ message: defaultMessage });
  }

  // In development, return detailed error message
  return res.status(500).json({ message: error.code || error.message });
};
