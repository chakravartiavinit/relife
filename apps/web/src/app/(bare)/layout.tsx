import { AppMotion } from '@/ui/components/motion-config'
import { RootHtml, rootMetadata, rootViewport } from '@/ui/root-html'

// Pages a visitor can open before signing in (/signin, /pair): the same look, none of the dashboard's chrome or data.

export const metadata = rootMetadata
export const viewport = rootViewport

export default function BareLayout({ children }: LayoutProps<'/'>) {
  return (
    <RootHtml>
      <AppMotion>{children}</AppMotion>
    </RootHtml>
  )
}
