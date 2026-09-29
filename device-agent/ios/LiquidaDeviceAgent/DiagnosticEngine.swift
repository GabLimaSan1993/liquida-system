import Foundation
import UIKit
import AVFoundation
import CoreMotion
import LocalAuthentication

struct AgentTest: Codable {
    let code: String
    let block: String
    let result: String
    let details: String?
    let value: [String: String]
}

struct AgentReport: Codable {
    let protocolVersion: String
    let platform: String
    let agentVersion: String
    let tests: [AgentTest]
}

enum DiagnosticEngine {
    static func run() async -> AgentReport {
        UIDevice.current.isBatteryMonitoringEnabled = true
        var tests: [AgentTest] = []

        let battery = UIDevice.current.batteryLevel
        tests.append(.init(
            code: "battery_agent",
            block: "bateria",
            result: battery >= 0 ? "pass" : "warning",
            details: nil,
            value: ["percentage": battery >= 0 ? String(Int(battery * 100)) : "unknown"]
        ))

        let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory())
        let total = (attrs?[.systemSize] as? NSNumber)?.stringValue ?? "unknown"
        let free = (attrs?[.systemFreeSize] as? NSNumber)?.stringValue ?? "unknown"
        tests.append(.init(
            code: "storage_agent",
            block: "hardware",
            result: "pass",
            details: nil,
            value: ["total_bytes": total, "free_bytes": free]
        ))

        let video = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera, .builtInTrueDepthCamera],
            mediaType: .video,
            position: .unspecified
        ).devices
        tests.append(.init(
            code: "camera_inventory_agent",
            block: "camera",
            result: video.isEmpty ? "fail" : "pass",
            details: nil,
            value: ["camera_count": String(video.count)]
        ))

        let audio = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInMicrophone],
            mediaType: .audio,
            position: .unspecified
        ).devices
        tests.append(.init(
            code: "microphone_inventory_agent",
            block: "audio",
            result: audio.isEmpty ? "warning" : "pass",
            details: "Prova funcional será executada pelo Agent.",
            value: ["microphone_count": String(audio.count)]
        ))

        let motion = CMMotionManager()
        tests.append(.init(
            code: "motion_inventory_agent",
            block: "sensores",
            result: "pass",
            details: nil,
            value: [
                "accelerometer": String(motion.isAccelerometerAvailable),
                "gyro": String(motion.isGyroAvailable),
                "magnetometer": String(motion.isMagnetometerAvailable),
                "device_motion": String(motion.isDeviceMotionAvailable)
            ]
        ))

        let context = LAContext()
        var authError: NSError?
        let biometric = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authError)
        tests.append(.init(
            code: "biometric_inventory_agent",
            block: "seguranca",
            result: biometric ? "pass" : "warning",
            details: authError?.localizedDescription,
            value: ["available": String(biometric)]
        ))

        let screen = UIScreen.main
        tests.append(.init(
            code: "display_inventory_agent",
            block: "tela",
            result: "pass",
            details: "Teste visual e touch serão executados no Agent.",
            value: [
                "width_points": String(Int(screen.bounds.width)),
                "height_points": String(Int(screen.bounds.height)),
                "scale": String(screen.scale)
            ]
        ))

        return AgentReport(
            protocolVersion: "liquida-device-agent/1",
            platform: "ios",
            agentVersion: "0.1.0",
            tests: tests
        )
    }
}
