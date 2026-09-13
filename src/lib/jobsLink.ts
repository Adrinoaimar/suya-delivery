export const JOBS_SITE_URL = 'https://jobs.suyadelivery.com/';

export function redirectToJobs(
  navigate: (url: string) => void = (url) => window.location.replace(url),
): void {
  navigate(JOBS_SITE_URL);
}
