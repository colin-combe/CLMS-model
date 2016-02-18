//    xiNET Cross-link Viewer
//    Copyright 2013 Rappsilber Laboratory
//
//    This product includes software developed at
//    the Rappsilber Laboratory (http://www.rappsilberlab.org/).
//
//    author: Colin Combe

//constructor for annotations
CLMS.model.AnnotatedRegion = function (annotName, startRes, endRes, colour, notes, cat) {
    this.name = annotName;
    this.start = startRes - 0;
    this.end = endRes - 0;
    
    this.category = cat;
    
    if (colour !== undefined && colour !== null) {
        this.colour = colour;
    }
    this.notes = notes;
    
}
