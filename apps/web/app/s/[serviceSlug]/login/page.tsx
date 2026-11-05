import LoginPageContent, {
  loginPageMetadata,
  type LoginPageQuery,
} from '../../../login/login-page-content';

export async function generateMetadata({ params }: { params: Promise<{ serviceSlug: string }> }) {
  const { serviceSlug } = await params;
  return loginPageMetadata(`/s/${serviceSlug}`);
}

export default async function ServiceLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<LoginPageQuery>;
}) {
  const { serviceSlug } = await params;
  return LoginPageContent({ searchParams, requiredServiceSlug: serviceSlug });
}
