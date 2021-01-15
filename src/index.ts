import axios from "axios";
import { debug } from "console";

interface BibleGatewayResult {
  searchRef: string;
  verses: Array<BibleVerseResult>;
}

interface BibleVerseResult {
  textBlocks : Array<{text : string, woj : boolean, debug? : string}>,
  text : string,
  chapterNumber? : number,
  verseNumber : number,
  fullRef? : string,
}

class BibleGatewayAPI {
  private parse: Function = null;

  constructor() {
    if (typeof DOMParser !== "undefined") {
      this.parse = (content: string) =>
        new DOMParser().parseFromString(content, "text/html");
    } else {
      this.parse = (content: string) => {
        const { JSDOM } = require("jsdom");
        const { document } = new JSDOM(content).window;
        return document;
      };
    }
  }

  async search(
    query = "John 3:16",
    version: string = "ESV"
  ): Promise<BibleGatewayResult> {
    let encodedSearch = encodeURIComponent(query);
    let encoodedVersion = encodeURIComponent(version);

    const url = `https://www.biblegateway.com/passage?search=${encodedSearch}&version=${encoodedVersion}`;

    const result = await axios.get(url);

    const document = this.parse(result.data);

    const searchRef = document.querySelector(".bcv").textContent;

    // Get span text elements
    let elements = document.querySelectorAll("p > span");
    //verse += JSON.stringify(elements)

    let verses : Array<BibleVerseResult> = new Array<BibleVerseResult>();
    // Iterate over the verses
    for (let i = 0; i < elements.length; i++) {
      let textElement = elements[i];

      let verseNumber;
      // Remove cross refs and footnotes from the results
      // Need to remove footnotes from woj class also but that dosent make sense as it seems cross refs are the only ones working -seems like footnotes are the ones that are not removing properly
      let crossRefs = textElement.querySelectorAll("sup.crossreference, sup.footnote, sup.versenum");
      for (let ci = 0; ci < crossRefs.length; ci++) {
        let refToRemove = crossRefs[ci];
        if (refToRemove.classList.contains("versenum")) {
          verseNumber = refToRemove.textContent;
        }
        refToRemove.parentNode.removeChild(refToRemove);
      }

      let text = textElement.textContent;
      let textBlocks : Array<{text : string, woj : boolean, debug? : string}> = [{text : text, woj : false }];
      let indexText = 0;

      let debug = "";
      // Find all woj
      let wojFound = textElement.querySelectorAll("span.woj");
      for (let wi = 0; wi < wojFound.length; wi++) {
        let wojElement = wojFound[wi];
        let toSearchFor = wojElement.innerHTML;
        let indexStart = textBlocks[indexText].text.indexOf(toSearchFor);
        let tempText = textBlocks[indexText].text;
        // Trim existing text
        let textBefore = tempText.slice(0,indexStart);
        textBlocks[indexText].text = textBefore;
        if (textBefore.length <= 0) {
          // Clean out the first item in the array if it is empty
          textBlocks.splice(indexText, 1);
        }
        // Push the woj text to the next item in the array
        // Remove extra whitespaces
        textBlocks.push({text : wojElement.textContent.replace(/\s{2,}/g, ' '), woj : true, debug});
        // Push any remaining text after it to deal with next, if any
        // Set the indexText to this new index so we can go from there next
        let nextTextToProcess = tempText.slice(indexStart + toSearchFor.length).replace(/\s{2,}/g, ' ');
        if (nextTextToProcess.length > 0) {
          let newLength = textBlocks.push({text : nextTextToProcess, woj : false});
          indexText = newLength - 1;
        }
      }

      // If we have no verse number -- we may in in a verse that is indented but not a new one
      // Simply append it to the previous
      if ((!verseNumber || verseNumber <= 0) && verses.length > 0) {
        verses[verses.length - 1].textBlocks.push(...textBlocks);
        verses[verses.length - 1].text += text.replace(/\s{2,}/g, ' ');
      } else {
        verses.push({textBlocks, text, verseNumber});
      }
    }

    if (verses.length === 0) {
      throw new Error("Could not find verse");
    }

    return Promise.resolve({ searchRef, verses });
  }
}

export { BibleGatewayAPI };
export default BibleGatewayAPI;
