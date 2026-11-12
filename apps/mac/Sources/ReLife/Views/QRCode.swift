import AppKit
import CoreImage.CIFilterBuiltins
import ReLifeKit
import SwiftUI

/// A QR code for a link. Always black on white (a scanner needs the contrast, in dark mode too).
struct QRCodeView: View {
    var text: String

    var body: some View {
        Group {
            if let image = Self.image(for: text) {
                Image(nsImage: image)
                    .interpolation(.none)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                Image(systemName: "qrcode").resizable().aspectRatio(contentMode: .fit).foregroundStyle(.secondary)
            }
        }
        .padding(Space.md)
        .background(Color.white, in: RoundedRectangle(cornerRadius: Tokens.radiusMd, style: .continuous))
        .accessibilityLabel("QR code. Scan it with your phone where \(Brand.name) is signed in.")
    }

    static func image(for text: String) -> NSImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)) else { return nil }
        let rep = NSCIImageRep(ciImage: output)
        let image = NSImage(size: rep.size)
        image.addRepresentation(rep)
        return image
    }
}
