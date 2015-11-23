# simple build process using google closure compile
java -jar compiler.jar --version

#versioning system consists of editing numbers in file name in last line
java -jar compiler.jar \
--js=../src/controller/Init.js \
--js=../src/model/Match.js \
--js=../src/model/Protein.js \
--js=../src/model/Annotation.js \
--js=../src/model/ProteinLink.js \
--js=../src/model/CrossLink.js \
--js=../src/controller/xiNET_Storage.js \
--js=../src/controller/ReadCSV.js \
--js_output_file=./CLMS_model.js;
