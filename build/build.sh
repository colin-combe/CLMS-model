# simple build process using google closure compile
java -jar compiler.jar --version

#versioning system consists of editing numbers in file name in last line
java -jar compiler.jar \
--language_in=ECMASCRIPT6_STRICT \
--language_out=ES5_STRICT \
--js=../src/CLMS/model/SearchResultsModel.js \
--js=../src/CLMS/model/SpectrumMatch.js \
--js=../src/CLMS/model/AnnotatedRegion.js \
--js=../src/CLMS/model/CrossLink.js \
--js_output_file=./CLMS_model.js;


