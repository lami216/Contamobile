package mr.alkarna.mobile.approved;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.json.JSONObject;

/** Test helper only: creates synthetic evidence and uses a server-generated public grant payload. */
public final class GenerateRecoveryPackage {
 public static void main(String[] args) throws Exception {
  if(args.length!=2)throw new IllegalArgumentException("grant-payload.json output.ctrescue");
  JSONObject grant=new JSONObject(Files.readString(Path.of(args[0])));
  Path synthetic=Files.createTempDirectory("rescue-interop-synthetic-");
  try{
   Path root=synthetic.resolve("app_webview/Default/IndexedDB"),file=root.resolve("origin.indexeddb.leveldb/000001.ldb");
   Files.createDirectories(file.getParent());Files.write(file,"synthetic-data-rescue-fixture\u0000\u0001\u0002\u0003\n".getBytes(StandardCharsets.UTF_8));
   File snapshot=synthetic.resolve("no_backup/data-rescue/"+grant.getString("caseId")+"/snapshot-"+UUID.randomUUID()).toFile();
   Map<String,File> roots=new HashMap<>();roots.put("profile0-default",root.toFile());
   RecoverySnapshot.Result captured=RecoverySnapshot.capture(synthetic.toFile(),roots,snapshot,RecoverySnapshot.Limits.defaults(),(done,total,bytes)->{});
   File output=new File(args[1]);if(output.getParentFile()!=null)Files.createDirectories(output.getParentFile().toPath());
   RecoveryPackage.write(grant,captured,output,System.currentTimeMillis());
   System.out.println(new JSONObject().put("packageSize",output.length()).put("packageSha256",RecoveryPackage.hash(output)).put("synthetic",true).put("files",captured.entries.size()));
   RecoverySnapshot.cleanup(synthetic.toFile(),snapshot);
  }finally{try(java.util.stream.Stream<Path> stream=Files.walk(synthetic)){for(Path path:stream.sorted(Comparator.reverseOrder()).toArray(Path[]::new))Files.deleteIfExists(path);}}
 }
}
