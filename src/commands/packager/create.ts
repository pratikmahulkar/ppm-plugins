import { flags, SfdxCommand, UX } from "@salesforce/command";
import { Messages, SfdxError } from "@salesforce/core";
import { AnyJson } from "@salesforce/ts-types";
import { spawnSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as parse from "xml-parser";
import * as xml2js from "xml2js";
import { version } from "chai";
import { strict } from "assert";
// import { sfdc } from "@salesforce/core";

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages("ppm-plugins", "packager");

export default class Create extends SfdxCommand {
  public static description = messages.getMessage("commandDescription");

  public static examples = [`Test comand`];

  public static args = [{ name: "file" }];

  protected static flagsConfig = {
    // flag with a value (-n, --name=VALUE)
    name: flags.string({
      char: "n",
      description: messages.getMessage("nameFlagDescription"),
    }),
    force: flags.boolean({
      char: "f",
      description: messages.getMessage("forceFlagDescription"),
    }),
    destination: flags.string({
      char: "d",
      description: "Destination Branch",
    }),
    source: flags.string({
      char: "s",
      description: "Source Branch",
    }),
    namespace: flags.string({
      char: "n",
      description: "Namespace",
    }),
    version: flags.string({
      char: "n",
      description: "API Version name",
    }),
    destructivepackagexml: flags.string({
      char: "r",
      description: "Package xml name for destructive changes",
    }),
    packagexml: flags.string({
      char: "p",
      description: "Package xml name",
    }),
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = true;

  public extract(fileList) {
    let metadataSet = new Set();
    fileList.forEach((fileName) => {
      let relatedMetadataFileName = null;
      //   const fileNameWithoutExt = path.parse(fileName).name;
      //   const fileExt = path.parse(fileName).ext;
      // If file is type of metadata
      // and try to find out related data file
      if (fileName.endsWith("-meta.xml")) {
        relatedMetadataFileName = fileName;
        // const dataFilePath = fileName.replace("-meta.xml", "");
        // this.ux.log(`Data file path ${dataFilePath}`);

        // if (fs.existsSync(dataFilePath)) {
        //   this.ux.log(`Data file found ${dataFilePath}`);
        //   filesNeedToBeCopied.add(dataFilePath);
        // }
      } else {
        const metadataFile = fileName + "-meta.xml";
        if (fs.existsSync(metadataFile)) {
          relatedMetadataFileName = metadataFile;
          // this.ux.log(`Found metadata file ${metadataFile}`);
        }
      }
      // this.ux.log(
      //     `File name ${fileName}`
      //   );
      if (!relatedMetadataFileName) {
        let parentFolder = path.dirname(fileName);
        let dirCont = fs.readdirSync(parentFolder);
        let files = dirCont.filter(function (elm) {
          return elm.endsWith("-meta.xml");
        });
        if (files && files.length > 0) {
          relatedMetadataFileName = path.join(parentFolder, files[0]);
        }
      }
      if (relatedMetadataFileName) {
        metadataSet.add(relatedMetadataFileName);
      } else {
        this.ux.error(`Not able to find metadata for ${fileName}`);
      }
      // this.ux.log(
      //   `File name ${fileName} Related metadata ${relatedMetadataFileName}`
      // );
      //   filesNeedToBeCopied.add(fileName);
      //   this.ux.log(
      //     `File name without extension ${fileNameWithoutExt} and extenstion ${fileExt}`
      //   );
      //   this.ux.log(`${fileName} is added or modified`);
    });
    return metadataSet;
  }

  public async run(): Promise<AnyJson> {
    const name = this.flags.name || "world";
    const apiVersion = this.flags.version || "49.0";
    const namespace =
      this.flags.namespace || "http://soap.sforce.com/2006/04/metadata";
    const descructiveXML =
      this.flags.destructivepackagexml || "destructiveChanges.xml";
    const packageXML = this.flags.packagexml || "package.xml";

    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    const query = "Select Name, TrialExpirationDate from Organization";

    // The type we are querying for
    interface Organization {
      Name: string;
      TrialExpirationDate: string;
    }

    // Query the org
    const result = await conn.query<Organization>(query);

    // Organization will always return one result, but this is an example of throwing an error
    // The output and --json will automatically be handled for you.
    if (!result.records || result.records.length <= 0) {
      throw new SfdxError(
        messages.getMessage("errorNoOrgResults", [this.org.getOrgId()])
      );
    }

    // Organization always only returns one result
    const orgName = result.records[0].Name;
    const trialExpirationDate = result.records[0].TrialExpirationDate;

    let outputString = `Hello Metadata ${name}! This is org: ${orgName}`;
    if (trialExpirationDate) {
      const date = new Date(trialExpirationDate).toDateString();
      outputString = `${outputString} and I will be around until ${date}!`;
    }
    // this.ux.log(outputString);

    // this.hubOrg is NOT guaranteed because supportsHubOrgUsername=true, as opposed to requiresHubOrgUsername.
    if (this.hubOrg) {
      const hubOrgId = this.hubOrg.getOrgId();
      this.ux.log(`My hub org id is: ${hubOrgId}`);
    }

    if (this.flags.force && this.args.file) {
      this.ux.log(`You input --force and a file: ${this.args.file}`);
    }

    const gitDiff = spawnSync("git", [
      "--no-pager",
      "diff",
      "--name-status",
      this.flags.destination,
      this.flags.source,
    ]);
    const gitDiffStdOut = gitDiff.stdout.toString();
    const gitDiffStdErr = gitDiff.stderr.toString();

    if (gitDiffStdErr) {
      this.ux.error(gitDiffStdErr);
      throw new SfdxError(
        messages.getMessage("errorNoOrgResults", [this.org.getOrgId()])
      );
    }
    let projectPaths = [];
    let retrieveSfdxProjectJson = await this.project.retrieveSfdxProjectJson();
    retrieveSfdxProjectJson
      .getContents()
      .packageDirectories.forEach((element) => {
        projectPaths.push(element.path);
      });
    // console.log(gitDiffStdOut);
    const fileList = gitDiffStdOut.split("\n");
    // let metadataSet = new Set();
    let deletedFilesSet = new Set();
    let mofiedFilesSet = new Set();

    fileList.forEach(function (fileName) {
      const array = fileName.split("\t");
      if (array && array.length > 1) {
        // get the git operation
        const operation = array[0];
        // remove the operation and spaces from fileName
        fileName = array.length > 2 ? array[2] : array[1];
        const deletedFile = array.length > 2 ? array[1] : null;
        if (deletedFile) {
          deletedFilesSet.add(deletedFile);
        }
        const count = projectPaths.filter((a) => fileName.startsWith(a)).length;
        if (count > 0) {
          switch (operation) {
            case "D":
              deletedFilesSet.add(fileName);
              break;
            // case "A":
            // case "M":
            default:
              mofiedFilesSet.add(fileName);
              break;
          }
        }
      }
    }, this);
    this.gitCheckout(this.flags.destination);
    let deletedMetadataset = this.extract(deletedFilesSet);
    this.createPackage(
      deletedMetadataset,
      descructiveXML,
      namespace,
      apiVersion
    );

    this.gitCheckout(this.flags.source);
    let metadataSet = this.extract(mofiedFilesSet);
    this.createPackage(metadataSet, packageXML, namespace, apiVersion);

    // Return an object to be displayed with --json
    return { orgId: this.org.getOrgId(), outputString };
  }

  public createPackage(metadataSet, packageFileName, namespace, apiVersion) {
    let typeMap = new Map();
    metadataSet.forEach((fileName) => {
      const fileNameWithoutExt = path.parse(fileName).name;
      const extractMemberName = fileNameWithoutExt.split(".")[0];
      let xml = fs.readFileSync(fileName, "utf8");
      let obj = parse(xml);
      let metadataType = obj.root.name;
      if (!typeMap.has(metadataType)) {
        typeMap.set(metadataType, []);
      }
      typeMap.get(metadataType).push(extractMemberName);
    }, this);
    let packageObject = {
      Package: {
        $: {
          xmlns: namespace,
        },
        types: [],
        version: apiVersion,
      },
    };
    typeMap.forEach((value, key) => {
      packageObject.Package.types.push({
        name: key,
        members: value,
      });
    });

    var builder = new xml2js.Builder();
    var xml = builder.buildObject(packageObject);
    fs.writeFileSync(packageFileName, xml);
  }

  public gitCheckout(branchName) {
    const gitSourceCheckout = spawnSync("git", ["checkout", branchName]);
    const gitSourceCheckoutdOut = gitSourceCheckout.stdout.toString();
    const gitSourceCheckoutStdErr = gitSourceCheckout.stderr.toString();
    // this.ux.log(gitSourceCheckoutdOut);
    if (gitSourceCheckoutStdErr) {
      this.ux.error(gitSourceCheckoutStdErr);
      //branchSwitchMessage
      const errorMessage = messages.getMessage("branchSwitchMessage", [
        branchName,
      ]);
      console.log(errorMessage);
      if (
        errorMessage != `Switched to branch '${branchName}'` &&
        gitSourceCheckoutStdErr != `Already on '${branchName}'`
      ) {
        throw new SfdxError(
          messages.getMessage("errorNoOrgResults", [gitSourceCheckoutStdErr])
        );
      }
    }
  }
}
