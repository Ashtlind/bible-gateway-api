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
  verseNumberString : string,
  fullRef? : string,
  startOfNewParagraph? : boolean,
  verseHeading? : string
}

class BibleGatewayAPI {
  private parse: Function = null;

  constructor() {
      this.parse = (content: string) => {
        const { JSDOM } = require("jsdom");
        const { document } = new JSDOM(content).window;
        return document;
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

    const searchRefElement = document.querySelector(".dropdown-display-text");
    if (!searchRefElement) {
      // Scripture not found
      return Promise.reject({ error : `Scripture not found, search: ${query}, version : ${version}` });
    }
    const searchRef = searchRefElement.textContent;

    // Get span text elements
    let elements = document.querySelectorAll("p > span");
    //verse += JSON.stringify(elements)

    let verses : Array<BibleVerseResult> = new Array<BibleVerseResult>();
    let chapterNumber;

    let verseNumber = 1;
    let verseNumberString = "";

    // Iterate over the verses
    for (let i = 0; i < elements.length; i++) {
      let textElement = elements[i];

      let oldVerseNumber = verseNumber;

      // Remove cross refs and footnotes from the results
      // Need to remove footnotes from woj class also but that dosent make sense as it seems cross refs are the only ones working -seems like footnotes are the ones that are not removing properly
      let crossRefs = textElement.querySelectorAll("sup.crossreference, sup.footnote, sup.versenum, span.chapternum");
      for (let ci = 0; ci < crossRefs.length; ci++) {
        let refToRemove = crossRefs[ci];
        if (refToRemove.classList.contains("chapternum")) {
          // Reset the verse to 1 as we are in a new chapter
          // Will be overridden in next step if this is incorrect
          verseNumber = 1;
          chapterNumber = parseInt(refToRemove.textContent);
        }
        if (refToRemove.classList.contains("versenum")) {
          verseNumber = parseInt(refToRemove.textContent);
          // Dosent seem to get the msg verses correctly yet
          verseNumberString = refToRemove.textContent;
        }
        refToRemove.parentNode.removeChild(refToRemove);
      }

      // Is the current verse the start of a new paragraph?
      // Are we the first child span tag of the parent p element?
      // If so lets set it
      let startOfNewParagraph = textElement.parentElement.querySelector("span") == textElement;

      // Is this a poetry section?
      // If so we need to intent each new verse
      let isPoetry = textElement.parentElement.parentElement.classList.contains("poetry");

      let text = textElement.textContent;
      let textBlocks : Array<{text : string, woj : boolean, startOfNewParagraph : boolean, isPoetry : boolean, debug? : string}> = [{text : text, woj : false, startOfNewParagraph,  isPoetry}];
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
        textBlocks.push({text : wojElement.textContent, woj : true, debug, startOfNewParagraph : false, isPoetry : false});
        // Push any remaining text after it to deal with next, if any
        // Set the indexText to this new index so we can go from there next
        let nextTextToProcess = tempText.slice(indexStart + toSearchFor.length);
        if (nextTextToProcess.length > 0) {
          let newLength = textBlocks.push({text : nextTextToProcess, woj : false, startOfNewParagraph : false, isPoetry : false});
          indexText = newLength - 1;
        }
      }

      // Is there a verse heading?
      let verseHeading = textElement.parentElement.previousElementSibling && textElement.parentElement.previousElementSibling.tagName && textElement.parentElement.previousElementSibling.tagName.toLowerCase() == "h3" ? textElement.parentElement.previousElementSibling.textContent : undefined;

      // If we have no verse number -- or it is the same as the pervious lines verse number,
      // we may be in a verse that is indented and is not a new one
      // Simply append it to the previous
      if ((!verseNumber || verseNumber <= 0 || oldVerseNumber == verseNumber) && verses.length > 0) {
        verses[verses.length - 1].textBlocks.push(...textBlocks);
        verses[verses.length - 1].text += text; //.replace(/\s{2,}/g, ' ')
      } else {
        // Otherwise it must be a new verse -- add it
        verses.push({textBlocks, text, verseNumber, verseNumberString, chapterNumber, fullRef : `${chapterNumber}:${verseNumber} ${searchRef.replace(/[0-9]/g, '')}`, startOfNewParagraph, verseHeading});
      }
    }

    if (verses.length === 0) {
      return Promise.reject({ error : `Scripture not found, search: ${query}, version : ${version}` });
    }

    return Promise.resolve({ searchRef, verses });
  }
}

export { BibleGatewayAPI };
export default BibleGatewayAPI;
