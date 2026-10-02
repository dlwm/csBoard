import Foundation
import UIKit
import UniformTypeIdentifiers
import Capacitor
import CSBoardNative

@objc(CSBoardCorePlugin)
public class CSBoardCorePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "CSBoardCorePlugin"
    public let jsName = "CSBoardCore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "storage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chooseDemos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openParser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestParser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeParser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseSources", returnType: CAPPluginReturnPromise)
    ]
    private let databaseQueue = DispatchQueue(label: "com.csboard.storage")
    private let parserQueue = DispatchQueue(label: "com.csboard.parser")
    private let importQueue = DispatchQueue(label: "com.csboard.import")
    private let lock = NSLock()
    private var database: MobilecoreDatabase?
    private var sources: [String: URL] = [:]
    private struct Session { let parser: MobilecoreParser; let sourceIds: [String] }
    private var sessions: [String: Session] = [:]
    private var pickerCall: CAPPluginCall?
    private var backgroundObserver: NSObjectProtocol?

    public override func load() {
        backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] _ in
            guard let self else { return }
            self.lock.lock(); let active = Array(self.sessions.values); self.lock.unlock()
            for session in active { session.parser.cancel() }
        }
    }
    deinit { if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) } }

    @objc func storage(_ call: CAPPluginCall) {
        databaseQueue.async {
            do {
                if self.database == nil {
                    let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("native-data")
                    var failure: NSError?
                    self.database = MobilecoreOpenDatabase(root.path, &failure)
                    if let failure { throw failure }
                }
                guard let database = self.database else { throw self.failure("Cannot open native storage") }
                var failure: NSError?
                let result = database.request(call.getString("method") ?? "", arguments: call.getString("arguments") ?? "{}", error: &failure)
                if let failure { throw failure }
                call.resolve(["result": result])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func chooseDemos(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pickerCall == nil else { call.reject("A file picker is already open"); return }
            guard let controller = self.bridge?.viewController else { call.reject("Application view is unavailable"); return }
            self.pickerCall = call
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
            picker.allowsMultipleSelection = true
            picker.delegate = self
            controller.present(picker, animated: true)
        }
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickerCall?.resolve(["files": []]); pickerCall = nil
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickerCall else { return }; pickerCall = nil
        importQueue.async {
            var imported: [String] = []
            do {
                guard urls.count <= 32 else { throw self.failure("Select at most 32 Demo files") }
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("demo-imports")
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                var files: [[String: Any]] = []
                for url in urls {
                    guard url.pathExtension.lowercased() == "dem" else { throw self.failure("Only .dem files are supported") }
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    let id = UUID().uuidString
                    let target = directory.appendingPathComponent(id + ".dem")
                    try FileManager.default.copyItem(at: url, to: target)
                    imported.append(id)
                    self.lock.lock(); self.sources[id] = target; self.lock.unlock()
                    let attributes = try FileManager.default.attributesOfItem(atPath: target.path)
                    var failure: NSError?
                    let hash = MobilecoreFingerprint(target.path, &failure)
                    if let failure { throw failure }
                    files.append(["nativeId": id, "name": url.lastPathComponent,
                                  "size": attributes[.size] as? NSNumber ?? 0,
                                  "contentHash": hash,
                                  "lastModified": ((attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000])
                }
                call.resolve(["files": files])
            } catch { self.removeSources(imported); call.reject(error.localizedDescription) }
        }
    }
    @objc func openParser(_ call: CAPPluginCall) {
        parserQueue.async {
            let ids = call.getArray("sourceIds", String.self) ?? []
            do {
                guard !ids.isEmpty && ids.count <= 32 else { throw self.failure("Invalid Demo sources") }
                self.lock.lock()
                let paths = ids.compactMap { self.sources[$0]?.path }
                self.lock.unlock()
                guard paths.count == ids.count else { throw self.failure("Demo source is unavailable") }
                let json = String(data: try JSONSerialization.data(withJSONObject: paths), encoding: .utf8)!
                var failure: NSError?
                let opened = MobilecoreOpenParser(json, &failure)
                if let failure { throw failure }
                guard let parser = opened else { throw self.failure("Cannot open parser") }
                let id = UUID().uuidString
                self.lock.lock(); self.sessions[id] = Session(parser: parser, sourceIds: ids); self.lock.unlock()
                let sources = try JSONSerialization.jsonObject(with: Data(parser.sources().utf8))
                call.resolve(["sessionId": id, "sources": sources])
            } catch { self.removeSources(ids); call.reject(error.localizedDescription) }
        }
    }
    @objc func requestParser(_ call: CAPPluginCall) {
        lock.lock(); let session = sessions[call.getString("sessionId") ?? ""]; lock.unlock()
        guard let session else { call.reject("Parser session is closed"); return }
        parserQueue.async {
            do {
                var failure: NSError?
                let result = session.parser.request(call.getString("method") ?? "", arguments: call.getString("arguments") ?? "{}", error: &failure)
                if let failure { throw failure }
                call.resolve(["result": result])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func closeParser(_ call: CAPPluginCall) {
        lock.lock(); let session = sessions.removeValue(forKey: call.getString("sessionId") ?? ""); lock.unlock()
        guard let session else { call.resolve(); return }
        session.parser.cancel()
        parserQueue.async { session.parser.close(); self.removeSources(session.sourceIds); call.resolve() }
    }
    @objc func releaseSources(_ call: CAPPluginCall) {
        parserQueue.async {
            let ids = call.getArray("sourceIds", String.self) ?? []
            self.lock.lock(); let active = Set(self.sessions.values.flatMap { $0.sourceIds }); self.lock.unlock()
            self.removeSources(ids.filter { !active.contains($0) });
            call.resolve()
        }
    }
    private func removeSources(_ ids: [String]) {
        for id in ids {
            lock.lock(); let url = sources.removeValue(forKey: id); lock.unlock()
            if let url { try? FileManager.default.removeItem(at: url) }
        }
    }
    private func failure(_ message: String) -> NSError { NSError(domain: "CSBoard", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}

class CSBoardViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(CSBoardCorePlugin()) }
}
