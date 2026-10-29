package mr.alkarna.mobile.approved;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only raw IndexedDB evidence capture. Call only after consent and before any WebView
 * initialization in this process. This class does not open a database, parse a record, repair
 * evidence, or infer recoverability from a filename. The caller immediately encrypts the
 * private no-backup copy and removes this transient directory before returning to the UI.
 */
final class RecoverySnapshot {
    static final class Limits {
        final int maxFiles;
        final long maxBytes, maxFileBytes, reserveBytes;
        Limits(int maxFiles, long maxBytes, long maxFileBytes, long reserveBytes) {
            if (maxFiles < 1 || maxFiles > 10000 || maxBytes < 1 || maxBytes > 512L * 1024 * 1024
                    || maxFileBytes < 1 || maxFileBytes > maxBytes || reserveBytes < 0)
                throw new IllegalArgumentException("invalid-capture-limits");
            this.maxFiles = maxFiles;
            this.maxBytes = maxBytes;
            this.maxFileBytes = maxFileBytes;
            this.reserveBytes = reserveBytes;
        }
        static Limits defaults() { return new Limits(4096, 256L * 1024 * 1024, 64L * 1024 * 1024, 16L * 1024 * 1024); }
    }

    interface Progress { void copied(int completed, int total, long copiedBytes); }

    static final class Entry {
        final String path;
        final long size, modifiedAt;
        String sha256 = "", status = "pending", error = "";
        Entry(String path, long size, long modifiedAt) {
            this.path = path; this.size = size; this.modifiedAt = modifiedAt;
        }
    }

    static final class Result {
        final File directory;
        final List<Entry> entries;
        final long copiedBytes;
        final boolean complete;
        Result(File directory, List<Entry> entries, long copiedBytes) {
            this.directory = directory;
            this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
            this.copiedBytes = copiedBytes;
            boolean okay = true;
            for (Entry entry : entries) if (!"copied".equals(entry.status) && !"empty".equals(entry.status)) okay = false;
            this.complete = okay;
        }
    }

    private static final class Source {
        final Path root, path;
        final Entry entry;
        final Object fileKey;
        Source(Path root, Path path, Entry entry, Object fileKey) {
            this.root = root; this.path = path; this.entry = entry; this.fileKey = fileKey;
        }
    }

    private RecoverySnapshot() {}

    static Result capture(File privateDataRoot, Map<String, File> indexedDbRoots, File destination,
                          Limits limits, Progress progress) throws IOException {
        if (privateDataRoot == null || indexedDbRoots == null || destination == null || limits == null
                || indexedDbRoots.size() > 16) throw new IOException("invalid-capture-input");
        // Context's data directory is the trust boundary; resolve Android's system-owned alias
        // once, then reject every symbolic link below this app-private boundary.
        Path suppliedRoot = privateDataRoot.toPath().toAbsolutePath().normalize();
        Path dataRoot = suppliedRoot.toRealPath();
        requireDirectory(dataRoot);
        Path suppliedDestination = destination.toPath().toAbsolutePath().normalize();
        if (!suppliedDestination.startsWith(suppliedRoot) || suppliedDestination.equals(suppliedRoot))
            throw new IOException("destination-outside-private-storage");
        Path target = dataRoot.resolve(suppliedRoot.relativize(suppliedDestination));
        if (!captureDestination(slash(suppliedRoot.relativize(suppliedDestination))))
            throw new IOException("destination-not-private-capture");
        // A fresh directory is mandatory: interruption must never overwrite an earlier capture.
        if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) throw new IOException("destination-exists");
        checkExistingParents(dataRoot, target.getParent());

        List<Source> sources = new ArrayList<>();
        List<Entry> entries = new ArrayList<>();
        int[] visited = {0};
        Map<String, File> sorted = new LinkedHashMap<>();
        indexedDbRoots.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .forEach(entry -> sorted.put(entry.getKey(), entry.getValue()));
        for (Map.Entry<String, File> input : sorted.entrySet()) {
            String alias = input.getKey();
            if (alias == null || !alias.matches("[A-Za-z0-9_-]{1,80}") || input.getValue() == null)
                throw new IOException("invalid-source-alias");
            Path supplied = input.getValue().toPath().toAbsolutePath().normalize();
            if (!supplied.startsWith(suppliedRoot)) throw new IOException("source-outside-private-storage");
            String relative = slash(suppliedRoot.relativize(supplied));
            if (!relative.matches("app_webview(?:_[A-Za-z0-9_-]{1,80})?/(?:Default/)?IndexedDB"))
                throw new IOException("source-not-allowlisted");
            Path root = dataRoot.resolve(suppliedRoot.relativize(supplied));
            if (target.startsWith(root) || root.startsWith(target)) throw new IOException("overlapping-capture-paths");
            checkExistingParents(dataRoot, root);
            if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) {
                Entry missing = new Entry(alias, 0, 0); missing.status = "missing"; missing.error = "indexeddb-root-absent";
                entries.add(missing); continue;
            }
            requireDirectory(root);
            int before = sources.size(), entryCount = entries.size();
            collect(root, root, alias, sources, entries, limits, visited);
            if (before == sources.size() && entryCount == entries.size()) {
                Entry empty = new Entry(alias, 0, Files.getLastModifiedTime(root, LinkOption.NOFOLLOW_LINKS).toMillis());
                empty.status = "empty"; entries.add(empty);
            }
        }
        long total = 0;
        for (Source source : sources) {
            if (source.entry.size > limits.maxFileBytes) throw new IOException("capture-file-limit");
            if (source.entry.size > limits.maxBytes - total) throw new IOException("capture-total-limit");
            total += source.entry.size;
        }
        Path existingParent = target.getParent();
        while (!Files.exists(existingParent, LinkOption.NOFOLLOW_LINKS)) existingParent = existingParent.getParent();
        if (limits.reserveBytes > Long.MAX_VALUE - total * 2) throw new IOException("capture-insufficient-space");
        long required = total * 2 + limits.reserveBytes;
        if (Files.getFileStore(existingParent).getUsableSpace() < required) throw new IOException("capture-insufficient-space");
        createPrivateDirectories(dataRoot, target);
        long copied = 0;
        int completed = 0;
        for (Source source : sources) {
            Path output = target.resolve(source.entry.path).normalize();
            try {
                if (Thread.currentThread().isInterrupted()) throw new IOException("capture-interrupted");
                checkExistingParents(dataRoot, source.path);
                BasicFileAttributes before = attributes(source.path);
                if (!sameSource(source, before)) throw new IOException("source-changed");
                createPrivateDirectories(target, output.getParent());
                MessageDigest digest = digest();
                long count = 0;
                try (InputStream input = Files.newInputStream(source.path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS);
                     OutputStream stream = Files.newOutputStream(output, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                    ownerOnly(output, false);
                    byte[] buffer = new byte[65536];
                    int n;
                    while ((n = input.read(buffer)) != -1) {
                        if (Thread.currentThread().isInterrupted()) throw new IOException("capture-interrupted");
                        if (n > source.entry.size - count) throw new IOException("source-changed");
                        stream.write(buffer, 0, n); digest.update(buffer, 0, n); count += n;
                    }
                }
                if (count != source.entry.size) throw new IOException("source-changed");
                try (FileChannel channel = FileChannel.open(output, StandardOpenOption.WRITE)) { channel.force(true); }
                checkExistingParents(dataRoot, source.path);
                if (!sameSource(source, attributes(source.path))) throw new IOException("source-changed");
                byte[] copiedHash = digest.digest();
                // A second bounded read catches mutation while a same-sized source was copied.
                if (!MessageDigest.isEqual(copiedHash, hashFile(source.path, source.entry.size)))
                    throw new IOException("source-changed");
                if (!sameSource(source, attributes(source.path))) throw new IOException("source-changed");
                source.entry.sha256 = hex(copiedHash); source.entry.status = "copied";
                copied += count;
            } catch (IOException failure) {
                source.entry.status = "failed";
                source.entry.error = safeError(failure);
                Files.deleteIfExists(output); // This is a fresh destination file, never an evidence source.
            }
            completed++;
            if (progress != null) progress.copied(completed, sources.size(), copied);
        }
        return new Result(target.toFile(), entries, copied);
    }

    private static void collect(Path root, Path directory, String alias, List<Source> sources,
                                List<Entry> entries, Limits limits, int[] visited) throws IOException {
        List<Path> children = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory)) {
            for (Path child : stream) {
                if (++visited[0] > limits.maxFiles) throw new IOException("capture-file-count-limit");
                children.add(child);
            }
        }
        children.sort(Comparator.comparing(path -> path.getFileName().toString()));
        for (Path child : children) {
            if (entries.size() >= limits.maxFiles) throw new IOException("capture-file-count-limit");
            String path = alias + "/" + slash(root.relativize(child));
            if (!safeRelative(path)) {
                Entry rejected = new Entry(alias + "/rejected-entry-" + entries.size(), 0, 0);
                rejected.status = "rejected"; rejected.error = "unsafe-evidence-name"; entries.add(rejected); continue;
            }
            BasicFileAttributes attrs = attributes(child);
            if (attrs.isSymbolicLink() || attrs.isOther()) {
                Entry rejected = new Entry(path, 0, attrs.lastModifiedTime().toMillis());
                rejected.status = "rejected"; rejected.error = "symbolic-link-or-special-file"; entries.add(rejected);
            } else if (attrs.isDirectory()) {
                if (root.relativize(child).getNameCount() > 20) throw new IOException("capture-depth-limit");
                collect(root, child, alias, sources, entries, limits, visited);
            } else if (attrs.isRegularFile()) {
                Entry entry = new Entry(path, attrs.size(), attrs.lastModifiedTime().toMillis());
                entries.add(entry); sources.add(new Source(root, child, entry, attrs.fileKey()));
            } else {
                Entry rejected = new Entry(path, 0, 0); rejected.status = "rejected";
                rejected.error = "unsupported-evidence-file"; entries.add(rejected);
            }
        }
    }

    static boolean safeRelative(String path) {
        if (path == null || path.length() < 1 || path.length() > 512 || path.startsWith("/")
                || path.indexOf('\\') >= 0 || path.indexOf(':') >= 0) return false;
        for (int i = 0; i < path.length(); i++) if (Character.isISOControl(path.charAt(i))) return false;
        for (String part : path.split("/", -1)) if (part.isEmpty() || part.equals(".") || part.equals("..")) return false;
        return true;
    }

    private static boolean sameSource(Source source, BasicFileAttributes value) {
        return value.isRegularFile() && !value.isSymbolicLink() && !value.isOther()
                && value.size() == source.entry.size && value.lastModifiedTime().toMillis() == source.entry.modifiedAt
                && (source.fileKey == null || source.fileKey.equals(value.fileKey()));
    }
    private static BasicFileAttributes attributes(Path path) throws IOException {
        return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
    }
    private static void requireDirectory(Path path) throws IOException {
        BasicFileAttributes attrs = attributes(path);
        if (!attrs.isDirectory() || attrs.isSymbolicLink() || attrs.isOther()) throw new IOException("unsafe-directory");
    }
    private static void checkExistingParents(Path boundary, Path path) throws IOException {
        if (!path.startsWith(boundary)) throw new IOException("path-outside-private-storage");
        Path cursor = boundary;
        for (Path component : boundary.relativize(path)) {
            cursor = cursor.resolve(component);
            if (!Files.exists(cursor, LinkOption.NOFOLLOW_LINKS)) break;
            BasicFileAttributes attrs = attributes(cursor);
            if (attrs.isSymbolicLink() || attrs.isOther()) throw new IOException("symbolic-link-or-special-file");
            if (!cursor.equals(path) && !attrs.isDirectory()) throw new IOException("unsafe-directory");
        }
    }
    private static void createPrivateDirectories(Path boundary, Path path) throws IOException {
        checkExistingParents(boundary, path);
        Path cursor = boundary;
        for (Path component : boundary.relativize(path)) {
            cursor = cursor.resolve(component);
            if (!Files.exists(cursor, LinkOption.NOFOLLOW_LINKS)) { Files.createDirectory(cursor); ownerOnly(cursor, true); }
            requireDirectory(cursor);
        }
    }
    private static void ownerOnly(Path path, boolean directory) throws IOException {
        try {
            Files.setPosixFilePermissions(path, java.nio.file.attribute.PosixFilePermissions.fromString(directory ? "rwx------" : "rw-------"));
        } catch (UnsupportedOperationException ignored) { /* Windows JVM tests use inherited private workspace ACLs. */ }
    }
    private static String slash(Path path) { return path.toString().replace(File.separatorChar, '/'); }
    private static MessageDigest digest() throws IOException {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new IOException("sha256-unavailable"); }
    }
    private static byte[] hashFile(Path path, long expected) throws IOException {
        MessageDigest hash = digest(); long count = 0;
        try (InputStream input = Files.newInputStream(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            byte[] buffer = new byte[65536]; int n;
            while ((n = input.read(buffer)) != -1) {
                if (n > expected - count) throw new IOException("source-changed");
                count += n; hash.update(buffer, 0, n);
            }
        }
        if (count != expected) throw new IOException("source-changed");
        return hash.digest();
    }
    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }
    private static String safeError(IOException error) {
        String code = error.getMessage();
        return code != null && code.matches("[a-z0-9-]{1,80}") ? code : "evidence-copy-failed";
    }

    /** Deletes only one previously created private capture, without following links. */
    static void cleanup(File privateDataRoot, File directory) throws IOException {
        Path supplied = privateDataRoot.toPath().toAbsolutePath().normalize();
        Path candidate = directory.toPath().toAbsolutePath().normalize();
        if (!candidate.startsWith(supplied) || candidate.equals(supplied)
                || candidate.getNameCount() <= supplied.getNameCount() + 1) throw new IOException("unsafe-cleanup-path");
        String relative = slash(supplied.relativize(candidate));
        if (!captureDestination(relative))
            throw new IOException("unsafe-cleanup-path");
        Path boundary = supplied.toRealPath();
        Path target = boundary.resolve(supplied.relativize(candidate));
        checkExistingParents(boundary, target);
        if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) return;
        deleteDestination(target, 0);
    }
    private static boolean captureDestination(String relative) {
        String uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
        return relative.matches("no_backup/data-rescue/" + uuid + "/snapshot-" + uuid);
    }
    private static void deleteDestination(Path path, int depth) throws IOException {
        if (depth > 24) throw new IOException("cleanup-depth-limit");
        BasicFileAttributes attrs = attributes(path);
        if (attrs.isSymbolicLink() || attrs.isOther()) throw new IOException("unsafe-cleanup-entry");
        if (attrs.isDirectory()) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(path)) {
                for (Path child : stream) deleteDestination(child, depth + 1);
            }
        }
        Files.delete(path);
    }
}
