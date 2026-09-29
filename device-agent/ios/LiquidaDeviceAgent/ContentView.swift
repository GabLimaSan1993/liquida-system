import SwiftUI

struct ContentView: View {
    @State private var status = "Preparando diagnóstico..."
    @State private var running = false

    var body: some View {
        ZStack {
            Color(red: 15/255, green: 23/255, blue: 42/255).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                Text("Liquida Diagnostics")
                    .font(.largeTitle.bold())
                    .foregroundColor(.white)
                Text("Diagnóstico automático do iPhone")
                    .foregroundColor(.gray)
                if running {
                    ProgressView().tint(.white)
                }
                Text(status)
                    .foregroundColor(.white)
                    .font(.headline)
                Spacer()
            }
            .padding(28)
        }
        .task {
            guard !running else { return }
            running = true
            let report = await DiagnosticEngine.run()
            status = "Diagnóstico automático concluído: \(report.tests.count) testes"
            running = false
        }
    }
}
