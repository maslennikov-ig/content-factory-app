#!/usr/bin/env python3
"""Read-only ELF caller evidence in an owned, isolated image fixture."""
import datetime, hashlib, json, pathlib, subprocess, tempfile
stage = pathlib.Path(__file__).resolve().parent
image = "content-factory-next:755d19fa731d"
initial = json.loads((stage / "elf-initial-parser.local.json").read_text())
name = "cf-dbxe-elf-exact-20261011"
container = subprocess.check_output(["docker", "create", "--pull=never", "--name", name,
    "--network", "none", "--read-only", "--entrypoint", "/bin/true", image], text=True).strip()
result = {"image":image, "symbols":[], "ownedContainerRemoved":False,
    "nativeDependencies":initial["dependencies"], "perlModules":initial["perlModules"],
    "perlBits":initial["perlBits"], "supersedes":"elf-initial-parser.local.json; the initial reader selected the trailing version index instead of symbol column8; no acceptance uses it"}
apis = {"strfmon","strfmon_l","ns_printrrf","ns_printrr","fp_nquery","ungetwc", "EVP_Cipher",
    "CMS_decrypt","OSSL_CMP_SRV_process_request","gss_accept_sec_context","gzprintf","gzvprintf"}
paths = ["/usr/local/bin/node","/usr/sbin/nginx","/usr/bin/curl",
    "/usr/lib/x86_64-linux-gnu/libcurl.so.4","/usr/lib/x86_64-linux-gnu/libstdc++.so.6",
    "/usr/lib/x86_64-linux-gnu/libz.so.1"] + [x["file"] for x in initial["dependencies"]]
try:
    with tempfile.TemporaryDirectory(prefix="cf-dbxe-elf-exact-") as temporary:
        for i,path in enumerate(paths):
            local = pathlib.Path(temporary) / str(i)
            subprocess.run(["docker","cp","-L",container+":"+path,str(local)],capture_output=True,check=True)
            proc = subprocess.run(["readelf","--wide","--dyn-syms",str(local)],text=True,capture_output=True,check=True)
            undefined = []
            for line in proc.stdout.splitlines():
                columns = line.split()
                if len(columns)>=8 and columns[6]=="UND":
                    undefined.append(columns[7].split("@")[0])
            assert len(undefined)>0, "no undefined symbols: "+path
            entry = {"file":path,"sha256":hashlib.sha256(local.read_bytes()).hexdigest(),
                "examinedUndefinedSymbols":len(undefined),"selectedApiImports":sorted(set(undefined)&apis),
                "alignedNewImports":[v for v in undefined if "align_val" in v],
                "pbdsImports":[v for v in undefined if "__gnu_pbds" in v]}
            if path.endswith("libstdc++.so.6"):
                disassembly = subprocess.check_output(["objdump","-d","--disassemble=_ZnwmSt11align_val_t",str(local)],text=True)
                entry["alignedNewCallsPosixMemalign"] = "posix_memalign@plt" in disassembly
                entry["disassemblySha256"] = hashlib.sha256(disassembly.encode()).hexdigest()
                (stage/"aligned-new-disassembly.local.txt").write_text(disassembly)
            result["symbols"].append(entry)
finally:
    subprocess.run(["docker","rm",container],capture_output=True,check=True)
result["ownedContainerRemoved"] = True
result["temporaryElfCopiesRemoved"] = True
result["capturedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
result["runnerSha256"] = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
(stage/"elf-consumers.local.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({"nativeElfFiles":len(initial["dependencies"]),"symbols":result["symbols"],
    "perlModules":result["perlModules"],"ownedContainerRemoved":True}))
