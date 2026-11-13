import { getRequestConfig } from 'next-intl/server';
import { MESSAGE_NAMESPACES } from './namespaces';
import { isAppLocale, routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isAppLocale(requested) ? requested : routing.defaultLocale;

  const entries = await Promise.all(
    MESSAGE_NAMESPACES.map(async (ns) => {
      const mod = (await import(`../messages/${locale}/${ns}.json`)) as { default: Record<string, unknown> };
      return [ns, mod.default] as const;
    })
  );

  return {
    locale,
    messages: Object.fromEntries(entries),
    timeZone: 'Asia/Bangkok',
  };
});
