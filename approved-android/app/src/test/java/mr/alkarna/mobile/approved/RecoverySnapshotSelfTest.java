package mr.alkarna.mobile.approved;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Standalone JVM safety tests; all bytes and paths are synthetic disposable fixtures. */
public final class RecoverySnapshotSelfTest {
    private static int passed, skipped;
    private static Path fixture;

    private interface Check { void run() throws Exception; }

    public static void main(String[] arguments) throws Exception { runAll(); }

    static void runAll() throws Exception {
        passed = 0; skipped = 0;
        fixture = Files.createTempDirectory("conta-rescue-synthetic-");
        try {
            test("binary LevelDB, logs, blobs and empty files copy byte-for-byte without writes", () -> {
                Path root = root("normal"), db = db(root);
                Files.createDirectories(db.resolve("https_appassets.androidplatform.net_0.indexeddb.blob/2/1"));
                Files.write(db.resolve("000001.ldb"), new byte[]{0, 1, (byte)255, 7, 8});
                Files.write(db.resolve("000002.log"), new byte[]{5, 3, 0, 2});
                Files.write(db.resolve("CURRENT"), "MANIFEST-000003\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                Files.write(db.resolve("MANIFEST-000003"), new byte[0]);
                Files.write(db.resolve("https_appassets.androidplatform.net_0.indexeddb.blob/2/1/blob"), new byte[]{9, 8});
                Map<String, String> before = hashes(db); Map<String, FileTime> times = times(db);
                RecoverySnapshot.Result result = capture(root, destination(root), RecoverySnapshot.Limits.defaults(), null);
                require(result.complete && result.entries.size() == 5, "complete raw snapshot");
                for (RecoverySnapshot.Entry entry : result.entries) {
                    require(entry.status.equals("copied") && entry.sha256.matches("[a-f0-9]{64}"), "manifest hash/status");
                    require(entry.sha256.equals(hash(Files.readAllBytes(result.directory.toPath().resolve(entry.path)))), "copied hash");
                }
                require(before.equals(hashes(db)) && times.equals(times(db)), "evidence unchanged");
            });
            test("absent IndexedDB reports absent, creates no source directory", () -> {
                Path root = root("absent"); Path db = root.resolve("app_webview/Default/IndexedDB");
                RecoverySnapshot.Result result = capture(root, destination(root), RecoverySnapshot.Limits.defaults(), null);
                require(!result.complete && result.entries.get(0).status.equals("missing"), "missing report");
                require(!Files.exists(db), "source was not initialized");
            });
            test("empty IndexedDB reports empty without claiming records", () -> {
                Path root = root("empty"); db(root);
                RecoverySnapshot.Result result = capture(root, destination(root), RecoverySnapshot.Limits.defaults(), null);
                require(result.complete && result.copiedBytes == 0 && result.entries.get(0).status.equals("empty"), "empty report");
            });
            test("activation and preferences directories are never allowlisted", () -> {
                Path root = root("activation"); Path secret = Files.createDirectories(root.resolve("no_backup"));
                Path dest = destination(root);
                expectIo(() -> RecoverySnapshot.capture(root.toFile(), Collections.singletonMap("activation", secret.toFile()), dest.toFile(), RecoverySnapshot.Limits.defaults(), null));
                require(!Files.exists(dest), "preflight writes nothing");
            });
            test("outside-app sources rejected before destination creation", () -> {
                Path root = root("outside"); Path dest = destination(root);
                expectIo(() -> RecoverySnapshot.capture(root.toFile(), Collections.singletonMap("outside", fixture.toFile()), dest.toFile(), RecoverySnapshot.Limits.defaults(), null));
                require(!Files.exists(dest), "no outside reads or destination");
            });
            test("destination outside private data rejected", () -> {
                Path root = root("outside-destination"); db(root);
                expectIo(() -> capture(root, fixture.resolve("outside-output"), RecoverySnapshot.Limits.defaults(), null));
            });
            test("destination overlapping originals rejected", () -> {
                Path root = root("overlap"); Path db = db(root);
                expectIo(() -> capture(root, db.resolve("capture"), RecoverySnapshot.Limits.defaults(), null));
            });
            test("existing snapshot never overwritten on replay", () -> {
                Path root = root("replay"); db(root); Path dest = destination(root); Files.createDirectories(dest);
                Files.write(dest.resolve("saved"), new byte[]{8});
                expectIo(() -> capture(root, dest, RecoverySnapshot.Limits.defaults(), null));
                require(Files.readAllBytes(dest.resolve("saved"))[0] == 8, "existing capture preserved");
            });
            test("individual file limit validated before any copy", () -> {
                Path root = root("file-cap"); Files.write(db(root).resolve("00001.ldb"), new byte[8]); Path dest = destination(root);
                expectIo(() -> capture(root, dest, new RecoverySnapshot.Limits(20, 12, 6, 0), null));
                require(!Files.exists(dest), "file-limit no writes");
            });
            test("total size limit validated before any copy", () -> {
                Path root = root("total-cap"); Path db = db(root); Path dest = destination(root);
                Files.write(db.resolve("1.ldb"), new byte[7]); Files.write(db.resolve("2.ldb"), new byte[7]);
                expectIo(() -> capture(root, dest, new RecoverySnapshot.Limits(20, 12, 8, 0), null));
                require(!Files.exists(dest), "total-limit no writes");
            });
            test("file count and empty-directory inventory bounded", () -> {
                Path root = root("count-cap"); Path db = db(root); Path dest = destination(root);
                for (int i = 0; i < 4; i++) Files.createDirectories(db.resolve("empty" + i));
                expectIo(() -> capture(root, dest, new RecoverySnapshot.Limits(3, 30, 10, 0), null));
                require(!Files.exists(dest), "count-limit no writes");
            });
            test("overdeep source trees rejected before copying", () -> {
                Path root = root("depth-cap"); Path nested = db(root); Path dest = destination(root);
                for (int i = 0; i < 21; i++) nested = Files.createDirectories(nested.resolve("deeper"));
                expectIo(() -> capture(root, dest, RecoverySnapshot.Limits.defaults(), null));
                require(!Files.exists(dest), "depth-limit no writes");
            });
            test("insufficient disk reserve stops before copies", () -> {
                Path root = root("disk"); Path db = db(root); Path dest = destination(root);
                Files.write(db.resolve("1.log"), new byte[]{2});
                long available = Files.getFileStore(root).getUsableSpace();
                expectIo(() -> capture(root, dest, new RecoverySnapshot.Limits(10, 30, 20, available + 1024 * 1024), null));
                require(!Files.exists(dest) && Files.readAllBytes(db.resolve("1.log"))[0] == 2, "space failure preserves original");
            });
            test("disk reserve overflow fails closed", () -> {
                Path root = root("disk-overflow"); Files.write(db(root).resolve("1.log"), new byte[]{2}); Path dest = destination(root);
                expectIo(() -> capture(root, dest, new RecoverySnapshot.Limits(10, 30, 20, Long.MAX_VALUE), null));
                require(!Files.exists(dest), "overflow cannot bypass reserve check");
            });
            test("source changes during capture produce failed entry, no copied substitute", () -> {
                Path root = root("mutation"); Path db = db(root); Path dest = destination(root);
                Files.write(db.resolve("1.ldb"), new byte[]{1}); Files.write(db.resolve("2.ldb"), new byte[]{2});
                RecoverySnapshot.Result result = capture(root, dest, RecoverySnapshot.Limits.defaults(), (done, total, copied) -> {
                    if (done == 1) try { Files.write(db.resolve("2.ldb"), new byte[]{3, 4}); } catch (IOException e) { throw new RuntimeException(e); }
                });
                require(!result.complete && result.entries.get(1).status.equals("failed"), "changed evidence rejected");
                require(!Files.exists(dest.resolve("default/2.ldb")), "failed output excluded");
                require(Arrays.equals(Files.readAllBytes(db.resolve("2.ldb")), new byte[]{3, 4}), "copy never repairs source");
            });
            test("interrupted capture never writes original or reports completion", () -> {
                Path root = root("interrupt"); Path db = db(root); Files.write(db.resolve("1.log"), new byte[]{4, 5});
                Map<String, String> before = hashes(db);
                try {
                    Thread.currentThread().interrupt();
                    RecoverySnapshot.Result result = capture(root, destination(root), RecoverySnapshot.Limits.defaults(), null);
                    require(!result.complete && result.copiedBytes == 0, "cancellation is incomplete");
                } finally { Thread.interrupted(); }
                require(before.equals(hashes(db)), "interruption preserves originals");
            });
            test("unsafe manifest paths rejected", () -> {
                for (String path : new String[]{"/abs", "../escape", "a/../b", "a\\b", "a:b", "a//b", "a\nb", ".", "a/"})
                    require(!RecoverySnapshot.safeRelative(path), "unsafe: " + path);
                require(RecoverySnapshot.safeRelative("default/https_appassets.androidplatform.net_0.indexeddb.leveldb/00001.ldb"), "Chromium path accepted");
            });
            test("cleanup refuses original IndexedDB and generic private directories", () -> {
                Path root = root("cleanup-refuse"); Path db = db(root); Files.write(db.resolve("1.ldb"), new byte[]{7});
                expectIo(() -> RecoverySnapshot.cleanup(root.toFile(), db.toFile()));
                expectIo(() -> RecoverySnapshot.cleanup(root.toFile(), root.resolve("no_backup").toFile()));
                require(Files.readAllBytes(db.resolve("1.ldb"))[0] == 7, "cleanup cannot reach evidence");
            });
            test("cleanup removes only a named transient capture", () -> {
                Path root = root("cleanup-capture"); Path db = db(root); Files.write(db.resolve("1.ldb"), new byte[]{7}); Path dest = destination(root);
                capture(root, dest, RecoverySnapshot.Limits.defaults(), null);
                RecoverySnapshot.cleanup(root.toFile(), dest.toFile());
                require(!Files.exists(dest) && Files.readAllBytes(db.resolve("1.ldb"))[0] == 7, "capture removed, originals preserved");
            });
            test("symlink source ancestor and children never followed", () -> {
                Path root = root("symlink"); Path db = db(root); Path outside = Files.createDirectories(fixture.resolve("outside-synthetic"));
                Files.write(outside.resolve("private-synthetic"), new byte[]{9});
                try { Files.createSymbolicLink(db.resolve("linked"), outside); }
                catch (UnsupportedOperationException | IOException | SecurityException unsupported) {
                    skipped++; System.out.println("SKIP symlinks: host cannot create symbolic links"); return;
                }
                RecoverySnapshot.Result result = capture(root, destination(root), RecoverySnapshot.Limits.defaults(), null);
                require(!result.complete && result.entries.get(0).status.equals("rejected"), "link rejected");
                require(result.copiedBytes == 0, "no linked bytes copied");
                Path root2 = root("symlink-parent"); Files.createDirectories(root2.resolve("app_webview"));
                Files.createSymbolicLink(root2.resolve("app_webview/Default"), outside);
                expectIo(() -> capture(root2, destination(root2), RecoverySnapshot.Limits.defaults(), null));
            });
            System.out.println("RecoverySnapshot safety tests: " + passed + " passed; " + skipped + " host-dependent skips");
        } finally { eraseFixture(fixture); }
    }

    private static void test(String name, Check check) throws Exception {
        int before = skipped;
        try { check.run(); if (skipped == before) { passed++; System.out.println("PASS " + name); } }
        catch (Exception | AssertionError failure) { throw new AssertionError(name, failure); }
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static void expectIo(Check check) throws Exception {
        try { check.run(); throw new AssertionError("expected safe failure"); } catch (IOException expected) { /* Expected. */ }
    }
    private static Path root(String name) throws IOException { return Files.createDirectories(fixture.resolve(name)); }
    private static Path db(Path root) throws IOException { return Files.createDirectories(root.resolve("app_webview/Default/IndexedDB")); }
    private static Path destination(Path root) { return root.resolve("no_backup/data-rescue/" + UUID.randomUUID() + "/snapshot-" + UUID.randomUUID()); }
    private static RecoverySnapshot.Result capture(Path root, Path destination, RecoverySnapshot.Limits limits, RecoverySnapshot.Progress progress) throws IOException {
        return RecoverySnapshot.capture(root.toFile(), Collections.singletonMap("default", root.resolve("app_webview/Default/IndexedDB").toFile()), destination.toFile(), limits, progress);
    }
    private static String hash(byte[] bytes) throws Exception {
        StringBuilder out = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }
    private static Map<String, String> hashes(Path root) throws Exception {
        Map<String, String> result = new HashMap<>();
        try (java.util.stream.Stream<Path> paths = Files.walk(root)) {
            for (Path path : (Iterable<Path>)paths.filter(Files::isRegularFile)::iterator) result.put(root.relativize(path).toString(), hash(Files.readAllBytes(path)));
        }
        return result;
    }
    private static Map<String, FileTime> times(Path root) throws IOException {
        Map<String, FileTime> result = new HashMap<>();
        try (java.util.stream.Stream<Path> paths = Files.walk(root)) {
            for (Path path : (Iterable<Path>)paths.filter(Files::isRegularFile)::iterator) result.put(root.relativize(path).toString(), Files.getLastModifiedTime(path));
        }
        return result;
    }
    private static void eraseFixture(Path path) throws IOException {
        // Fixture root is generated by createTempDirectory, never supplied by a customer.
        try (java.util.stream.Stream<Path> paths = Files.walk(path)) {
            for (Path item : (Iterable<Path>)paths.sorted(java.util.Comparator.reverseOrder())::iterator) Files.delete(item);
        }
    }
}
