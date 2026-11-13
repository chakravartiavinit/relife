import type { MetadataRoute } from 'next'
import { publicReady, siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return publicReady
    ? { rules: { userAgent: '*', allow: '/', disallow: ['/w/', '/api/'] }, sitemap: `${siteUrl}/sitemap.xml` }
    : { rules: { userAgent: '*', disallow: '/' } }
}
