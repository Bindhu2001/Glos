export function apiErrorMessage(err: any, fallback = 'Something went wrong. Please try again.'): string {
  return err?.response?.data?.error ?? err?.message ?? fallback;
}
